"""
Self-check:  python check.py
Tests the important promises of the planner on a throw-away database.
"""
import os
import random
import shutil
import tempfile

# The self-check must always use a disposable local database, even if the shell
# running it has production connection variables configured.
os.environ.pop("DATABASE_URL", None)
os.environ.pop("RENDER", None)
os.environ["APP_ENV"] = "development"
os.environ["METRO_DEMO_MODE"] = "true"
CHECK_DIR = tempfile.mkdtemp(prefix="metro-check-", dir=os.path.dirname(os.path.abspath(__file__)))
os.environ["METRO_DB"] = os.path.join(CHECK_DIR, "check.db")

from app import config as C, optimizer as O, risk                      # noqa: E402
from app.alerts import build_alerts                                   # noqa: E402
from app.db import DailyLog, SessionLocal, Train, engine, init_db       # noqa: E402
from app.seed import seed                                              # noqa: E402

ok = True


def check(name, cond):
    global ok
    ok &= bool(cond)
    print(("  PASS  " if cond else "  FAIL  ") + name)


init_db()
db = SessionLocal()
seed(db)
info = risk.train_model(db)
risk.score_fleet(db)
check(f"risk model trained on {info['rows']} records", info["rows"] > 1000)
risks = [t.risk for t in db.query(Train).all()]
check("risk scores are between 0 and 1 and not all the same", 0 <= min(risks) < max(risks) <= 1)

rows = O.build_rows(db.query(Train).order_by(Train.id).all())
for strategy in C.STRATEGIES:
    plan = O.solve(rows, strategy)
    blocked_in_service = [e["code"] for e, r in zip(plan["entries"], rows) if r["blocked"] and e["assignment"] == "service"]
    check(f"[{strategy}] no unsafe train in service", not blocked_in_service)
    check(f"[{strategy}] every train has exactly one status", len(plan["entries"]) == C.FLEET_SIZE)
    check(f"[{strategy}] both lines fully covered", all(v["have"] == v["need"] for v in plan["summary"]["coverage"].values()))
    check(f"[{strategy}] maintenance bays not exceeded", plan["summary"]["counts"]["maintenance"] <= C.MAINTENANCE_BAYS)
    check(f"[{strategy}] depot bay limits respected", all(
        sum(1 for e, r in zip(plan["entries"], rows)
            if r["depot"] == depot and e["assignment"] == "maintenance") <= capacity
        for depot, capacity in C.MAINTENANCE_BAYS_BY_DEPOT.items()))

# An officer can request more work than one depot can physically process.
same_depot = [r["code"] for r in rows if r["depot"] == C.DEPOTS["line_1"] and not r["blocked"]][:4]
capacity_plan = O.solve(rows, "safest", {code: "maintenance" for code in same_depot})
line1_maint = sum(1 for e, r in zip(capacity_plan["entries"], rows)
                  if r["depot"] == C.DEPOTS["line_1"] and e["assignment"] == "maintenance")
check("manual maintenance requests respect each depot's three-bay cap",
      line1_maint <= 3 and any("reached its 3-bay capacity" in w for w in capacity_plan["summary"]["warnings"]))

# No history / one-class history must safely use an explicitly identified heuristic.
db.query(DailyLog).delete()
db.flush()
fallback = risk.train_model(db)
fallback_score, fallback_reasons = risk.score_train(db.query(Train).first())
check("empty fault history selects heuristic risk mode", fallback["source"] == "heuristic"
      and risk.model_mode() == "heuristic" and 0 <= fallback_score <= 1 and len(fallback_reasons) >= 2)
db.rollback()
info = risk.train_model(db)

unsafe = next(r["code"] for r in rows if r["blocked"])
plan = O.solve(rows, "safest", {unsafe: "service"})
check("forcing an unsafe train into service is refused", any(unsafe in w for w in plan["summary"]["warnings"])
      and next(e for e in plan["entries"] if e["code"] == unsafe)["assignment"] != "service")

alert_train = db.query(Train).first()
original_km = alert_train.km_since_overhaul
alert_train.km_since_overhaul = C.OVERHAUL_KM
approved = {"status": "approved", "entries": [{"code": alert_train.code, "assignment": "service"}],
            "summary": {"warnings": []}}
alerts = build_alerts([alert_train], approved)
check("approved service plan alerts if an overhaul becomes due", any(
    a["title"] == "Approved plan is now unsafe" for a in alerts))
alert_train.km_since_overhaul = original_km

# Fuzz test: 100 random fleets. The safety rules must hold every single time.
rng = random.Random(1)
violations = 0
for _ in range(100):
    fuzz = [dict(r, blocked=rng.random() < 0.3, risk=rng.random(), km=rng.uniform(0, 26000),
                 cleaning_due=rng.random() < 0.3, open_cards=rng.randint(0, 3), blocks=["test"]) for r in rows]
    result = O.solve(fuzz, rng.choice(list(C.STRATEGIES)))
    violations += sum(1 for e, r in zip(result["entries"], fuzz) if r["blocked"] and e["assignment"] == "service")
    violations += result["summary"]["counts"]["service"] > sum(C.SERVICE_NEEDED.values())
    violations += result["summary"]["counts"]["maintenance"] > C.MAINTENANCE_BAYS
    for depot, capacity in C.MAINTENANCE_BAYS_BY_DEPOT.items():
        violations += sum(1 for e, r in zip(result["entries"], fuzz)
                          if r["depot"] == depot and e["assignment"] == "maintenance") > capacity
check("100 random fleets: safety rules never broken", violations == 0)

print("\nALL CHECKS PASSED" if ok else "\nSOME CHECKS FAILED")
db.close()
engine.dispose()
shutil.rmtree(CHECK_DIR, ignore_errors=True)
raise SystemExit(0 if ok else 1)
