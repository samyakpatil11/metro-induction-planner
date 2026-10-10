"""
Comprehensive integration test suite for the Admin / Data Manager features:
1. Data Management: Fleet CRUD, Timetable, Stations, Depot Bays
2. Constraints: Get, Update, Presets, Reset Defaults
3. Scheduler Re-run & Compare: CP-SAT execution with DB constraints, KPIs, history
4. Infeasibility Diagnosis: Trigger conflicting constraints and verify plain-language explanation
5. Change Log: Verify audit logging of CRUD actions and Reset to Synthetic Data endpoint
"""
import os
import json
import tempfile
from datetime import date, timedelta
from fastapi.testclient import TestClient

# Setup disposable local test database
os.environ.pop("DATABASE_URL", None)
os.environ.pop("RENDER", None)
os.environ["APP_ENV"] = "development"
os.environ["METRO_DEMO_MODE"] = "true"
TEST_DIR = tempfile.mkdtemp(prefix="metro-admin-test-", dir=os.path.dirname(os.path.abspath(__file__)))
os.environ["METRO_DB"] = os.path.join(TEST_DIR, "admin_test.db")

from app.main import app
from app.db import init_db, SessionLocal, Train, ConstraintConfig, ConstraintPreset, TimetableParam, Station, DepotBay, ChangeLog
from app.seed import seed, seed_metadata

init_db()
db = SessionLocal()
seed(db, include_demo_users=True)
seed_metadata(db)
db.close()

client = TestClient(app)


# Helper to get officer token
def get_auth_token():
    res = client.post("/api/login", json={"username": "officer", "password": "officer123"})
    assert res.status_code == 200, res.text
    return res.json()["token"]

token = get_auth_token()
headers = {"Authorization": f"Bearer {token}"}

print("\n--- Running Admin / Data Manager Feature Verification ---")

# 1. Verify Health
res = client.get("/api/health")
assert res.status_code == 200 and res.json()["ok"] is True
print("  PASS  API Health Check")

# 2. Fleet CRUD
# Create
new_train = {
    "code": "NMR-99",
    "line": "line_1",
    "depot": "Milan Depot (Khapri)",
    "track": "S-05",
    "track_position": 1,
    "status": "standby",
    "cert_expiry": (date.today() + timedelta(days=60)).isoformat(),
    "km_since_overhaul": 4500.0,
    "total_km": 25000.0,
    "branding_partner": "Nagpur Metro Rail",
    "branding_priority": "high",
}
res = client.post("/api/trains", json=new_train, headers=headers)
assert res.status_code == 200, res.text
assert res.json()["code"] == "NMR-99"
print("  PASS  Create Train (POST /api/trains)")

# Read Detail
res = client.get("/api/trains/NMR-99", headers=headers)
assert res.status_code == 200
assert res.json()["branding_partner"] == "Nagpur Metro Rail"
print("  PASS  Get Train Detail (GET /api/trains/NMR-99)")

# Update
res = client.put("/api/trains/NMR-99", json={"km_since_overhaul": 5200.0, "status": "service"}, headers=headers)
assert res.status_code == 200
assert res.json()["km_since_overhaul"] == 5200.0
print("  PASS  Update Train (PUT /api/trains/NMR-99)")

# Delete
res = client.delete("/api/trains/NMR-99", headers=headers)
assert res.status_code == 200 and res.json()["deleted"] == "NMR-99"
print("  PASS  Delete Train (DELETE /api/trains/NMR-99)")

# 3. Timetable Parameters CRUD
res = client.get("/api/timetable", headers=headers)
assert res.status_code == 200
assert len(res.json()) >= 2
print("  PASS  Get Timetable (GET /api/timetable)")

res = client.put("/api/timetable/line_1", json={
    "first_train_time": "05:45",
    "last_train_time": "23:00",
    "peak_headway_min": 12,
    "off_peak_headway_min": 18,
    "trips_per_train": 10,
    "service_needed": 8,
    "corridor_km": 19.65
}, headers=headers)
assert res.status_code == 200
assert res.json()["first_train_time"] == "05:45"
print("  PASS  Update Timetable (PUT /api/timetable/line_1)")

# 4. Stations & Depots CRUD
res = client.get("/api/stations", headers=headers)
assert res.status_code == 200 and len(res.json()) > 0
print("  PASS  Get Stations (GET /api/stations)")

res = client.get("/api/depots", headers=headers)
assert res.status_code == 200 and len(res.json()) > 0
print("  PASS  Get Depot Bays (GET /api/depots)")

# 5. Constraints Editor & Presets
res = client.get("/api/constraints", headers=headers)
assert res.status_code == 200
c_data = res.json()
assert len(c_data["constraints"]) >= 8
assert len(c_data["presets"]) >= 3
print("  PASS  Get Constraints & Presets (GET /api/constraints)")

# Batch update constraint
res = client.put("/api/constraints", json={
    "constraints": [
        {"key": "max_standby", "enabled": True, "is_hard": False, "weight": 4.0, "value": 6}
    ]
}, headers=headers)
assert res.status_code == 200
updated_c = next(c for c in res.json()["constraints"] if c["key"] == "max_standby")
assert updated_c["weight"] == 4.0 and updated_c["value"] == 6
print("  PASS  Update Constraints (PUT /api/constraints)")

# Apply preset "Festival rush"
festival_preset = next(p for p in c_data["presets"] if p["name"] == "Festival rush")
res = client.post(f"/api/constraints/presets/{festival_preset['id']}/apply", headers=headers)
assert res.status_code == 200
print("  PASS  Apply Preset (POST /api/constraints/presets/{id}/apply)")

# 6. Re-run Scheduler & Compare
res = client.post("/api/schedule/run", json={"strategy": "safest", "save": True}, headers=headers)
if res.status_code != 200:
    print("Schedule run failed with:", res.status_code, res.text)
assert res.status_code == 200, res.text

sched_res = res.json()
assert "current_plan" in sched_res
assert "kpis" in sched_res
assert "trains_in_service" in sched_res["kpis"]
assert "mileage_variance" in sched_res["kpis"]
print(f"  PASS  Scheduler Re-run with DB Constraints (Service: {sched_res['kpis']['trains_in_service']}, Variance: {sched_res['kpis']['mileage_variance']})")

# Schedule History
res = client.get("/api/schedule/history", headers=headers)
assert res.status_code == 200 and len(res.json()) >= 1
print("  PASS  Get Schedule History (GET /api/schedule/history)")

# 7. Infeasibility Plain-Language Diagnostic
# Impose impossible constraint: require 22 service trains on Line 1 when fleet only has ~10 safe trains
res = client.put("/api/constraints", json={
    "constraints": [
        {"key": "min_service_l1", "enabled": True, "is_hard": True, "weight": 10.0, "value": 30}
    ]
}, headers=headers)
assert res.status_code == 200

res = client.post("/api/schedule/run", json={"strategy": "safest", "save": False}, headers=headers)
assert res.status_code == 422
err_msg = res.json()["detail"]
assert "Fleet shortage" in err_msg or "Constraint Conflict" in err_msg
print(f"  PASS  Infeasibility Plain-Language Diagnostics: {err_msg[:80]}...")

# 8. Change Log Verification
res = client.get("/api/changelog?limit=10", headers=headers)
assert res.status_code == 200
log_data = res.json()
assert log_data["total"] >= 3
assert len(log_data["logs"]) >= 3
print(f"  PASS  Change Log Tracking ({log_data['total']} logged modifications)")

# 9. Reset to Original Synthetic Data
res = client.post("/api/reset-synthetic-data", headers=headers)
assert res.status_code == 200 and res.json()["ok"] is True

# Verify clean state re-established
res = client.get("/api/constraints", headers=headers)
clean_c = next(c for c in res.json()["constraints"] if c["key"] == "min_service_l1")
assert clean_c["value"] == 8
print("  PASS  Reset to Original Synthetic Data (POST /api/reset-synthetic-data)")

print("\nALL ADMIN / DATA MANAGER TESTS PASSED SUCCESSFULLY!")
