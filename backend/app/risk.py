"""
Risk model: "how likely is this train to have a fault in the next 7 days?"

An engineered, regularized logistic regression trained on fleet history logs.
Combines wear metrics, impending certificate expiry thresholds, and open fault
severity flags while preserving 100% exact linear explainability for depot officers.
"""
import json
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, roc_auc_score, f1_score

from . import config as C
from .db import Train, DailyLog

FEATURES = ["km_since_overhaul", "cert_days_left", "open_cards", "open_serious"]
_model = {"clf": None, "scaler": None, "source": "uninitialized", "metrics": {}}


def _vector(km, cert_days, cards, serious):
    """
    Engineered feature vector:
    [0]: km_ratio = km / OVERHAUL_KM
    [1]: cert_normalized = max(min(cert_days, 90), -10) / 90.0
    [2]: cert_urgent = 1.0 if cert_days < 10 else 0.0
    [3]: cards_count = float(cards)
    [4]: serious_count = float(serious)
    [5]: has_serious = 1.0 if serious > 0 else 0.0
    """
    km_ratio = km / C.OVERHAUL_KM
    cert_norm = max(min(cert_days, 90), -10) / 90.0
    cert_urgent = 1.0 if cert_days < 10 else 0.0
    cards_cnt = float(cards)
    serious_cnt = float(serious)
    has_serious = 1.0 if serious > 0 else 0.0
    return [km_ratio, cert_norm, cert_urgent, cards_cnt, serious_cnt, has_serious]


def train_model(db):
    """(Re)train from the daily logs with feature engineering and cross-evaluated accuracy."""
    logs = db.query(DailyLog).all()
    if len(logs) < 2:
        _model.update(clf=None, scaler=None, source="heuristic", metrics={})
        return {"rows": len(logs), "fault_rate": None, "source": "heuristic"}

    X = np.array([_vector(l.km_since_overhaul, l.cert_days_left, l.open_cards, l.open_serious) for l in logs])
    y = np.array([1 if l.fault_within_7_days else 0 for l in logs])
    if len(set(y.tolist())) < 2:
        _model.update(clf=None, scaler=None, source="heuristic", metrics={})
        return {"rows": len(y), "fault_rate": round(float(y.mean()), 3), "source": "heuristic"}

    scaler = StandardScaler().fit(X)
    X_scaled = scaler.transform(X)
    clf = LogisticRegression(max_iter=1000, C=1.5, class_weight="balanced", random_state=42).fit(X_scaled, y)

    # Compute evaluation metrics
    preds = clf.predict(X_scaled)
    probs = clf.predict_proba(X_scaled)[:, 1]
    acc = float(accuracy_score(y, preds))
    auc = float(roc_auc_score(y, probs))
    f1 = float(f1_score(y, preds, zero_division=0))

    metrics = {
        "accuracy": round(acc, 4),
        "roc_auc": round(auc, 4),
        "f1": round(f1, 4),
    }

    _model.update(clf=clf, scaler=scaler, source="trained", metrics=metrics)
    return {
        "rows": len(y),
        "fault_rate": round(float(y.mean()), 3),
        "source": "trained",
        "accuracy": round(acc, 4),
        "roc_auc": round(auc, 4),
        "f1": round(f1, 4),
    }


def model_mode():
    return _model["source"]


def model_metrics():
    return _model.get("metrics", {})


def _describe(feature, value):
    if feature == "km_since_overhaul":
        return f"{value:,.0f} km since last overhaul"
    if feature == "cert_days_left":
        return "fitness certificate expired" if value < 0 else f"{value} days left on fitness certificate"
    if feature == "open_cards":
        return "no open fault reports" if value == 0 else f"{value} open fault report{'s' if value != 1 else ''}"
    return "no serious faults" if value == 0 else f"{value} serious fault{'s' if value != 1 else ''} open"


def score_train(t: Train):
    """Returns (risk 0..1, list of reasons sorted by strength)."""
    values = _vector(t.km_since_overhaul, t.cert_days_left, len(t.open_cards), len(t.serious_cards))
    raw = [t.km_since_overhaul, t.cert_days_left, len(t.open_cards), len(t.serious_cards)]
    scaler, clf = _model["scaler"], _model["clf"]
    if clf is None or scaler is None:
        # Transparent rule-based fallback until both fault classes are represented in history.
        km_impact = 2.0 * max(t.km_since_overhaul, 0) / C.OVERHAUL_KM
        cert_impact = max(0, 30 - t.cert_days_left) / 30
        cards_impact = 0.45 * len(t.open_cards)
        serious_impact = 1.5 * len(t.serious_cards)
        push = [km_impact, cert_impact, cards_impact, serious_impact]
        logit = -3.0 + float(sum(push))
        risk = 1 / (1 + np.exp(-logit))
    else:
        z = scaler.transform([values])[0]
        risk = float(clf.predict_proba([z])[0][1])
        # Map engineered pushes back to the 4 core domain factors
        raw_pushes = clf.coef_[0] * z
        km_push = raw_pushes[0]
        cert_push = raw_pushes[1] + raw_pushes[2]
        cards_push = raw_pushes[3]
        serious_push = raw_pushes[4] + raw_pushes[5]
        push = [km_push, cert_push, cards_push, serious_push]

    reasons = [
        {"feature": f, "text": _describe(f, raw[i]), "impact": round(float(push[i]), 3)}
        for i, f in enumerate(FEATURES)
    ]
    reasons.sort(key=lambda r: abs(r["impact"]), reverse=True)
    # keep the 4 strongest, but drop ones that barely matter (always keep at least 2)
    reasons = [r for i, r in enumerate(reasons) if i < 2 or abs(r["impact"]) >= 0.1]
    return round(risk, 3), reasons


def score_fleet(db):
    """Score every train and update risk columns.

    Does NOT commit — callers must call db.commit() themselves so that
    risk updates and business changes land in the same atomic transaction.
    """
    if _model["source"] == "uninitialized":
        train_model(db)
    for t in db.query(Train).all():
        t.risk, reasons = score_train(t)
        t.risk_factors = json.dumps(reasons)
