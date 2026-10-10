"""
Risk model: "how likely is this train to have a fault in the next 7 days?"

A logistic regression is trained on the daily logs. It is deliberately simple:
every feature's push on the risk can be read straight off the model, so the
explanation shown to the officer is exact (no extra SHAP library needed).
"""
import json
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from . import config as C
from .db import Train, DailyLog

FEATURES = ["km_since_overhaul", "cert_days_left", "open_cards", "open_serious"]
_model = {"clf": None, "scaler": None, "source": "uninitialized"}


def _vector(km, cert_days, cards, serious):
    # certificate days are capped so an expired train is not treated as an outlier
    return [km, max(min(cert_days, 90), -10), cards, serious]


def train_model(db):
    """(Re)train from the daily logs. Takes well under a second."""
    logs = db.query(DailyLog).all()
    X = np.array([_vector(l.km_since_overhaul, l.cert_days_left, l.open_cards, l.open_serious) for l in logs])
    y = np.array([1 if l.fault_within_7_days else 0 for l in logs])
    if len(y) < 2 or len(set(y.tolist())) < 2:
        _model.update(clf=None, scaler=None, source="heuristic")
        return {"rows": len(y), "fault_rate": round(float(y.mean()), 3) if len(y) else None,
                "source": "heuristic"}
    scaler = StandardScaler().fit(X)
    clf = LogisticRegression(max_iter=1000, class_weight=None).fit(scaler.transform(X), y)
    _model.update(clf=clf, scaler=scaler, source="trained")
    return {"rows": len(y), "fault_rate": round(float(y.mean()), 3), "source": "trained"}


def model_mode():
    return _model["source"]


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
        push = np.array([km_impact, cert_impact, cards_impact, serious_impact])
        logit = -3.0 + float(push.sum())
        risk = 1 / (1 + np.exp(-logit))
    else:
        z = scaler.transform([values])[0]
        risk = float(clf.predict_proba([z])[0][1])
        # For a linear model, coefficient x standardized value is exactly each feature's push
        push = clf.coef_[0] * z
    reasons = [
        {"feature": f, "text": _describe(f, raw[i]), "impact": round(float(push[i]), 3)}
        for i, f in enumerate(FEATURES)
    ]
    reasons.sort(key=lambda r: abs(r["impact"]), reverse=True)
    # keep the 4 strongest, but drop ones that barely matter (always keep at least 2)
    reasons = [r for i, r in enumerate(reasons) if i < 2 or abs(r["impact"]) >= 0.1]
    return round(risk, 3), reasons


def score_fleet(db):
    """Score every train and save the result. Call after any fault report changes."""
    if _model["source"] == "uninitialized":
        train_model(db)
    for t in db.query(Train).all():
        t.risk, reasons = score_train(t)
        t.risk_factors = json.dumps(reasons)
    db.commit()
