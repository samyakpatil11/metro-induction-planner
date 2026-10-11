"""
End-to-End Comprehensive Test Suite for Nagpur Metro Induction Planner.
Verifies all capabilities end-to-end:
1. Static frontend assets & SPA fallback routing
2. Authentication, role verification & token refresh
3. Overview dashboard & fleet alerts
4. Fleet & train management (CRUD + CSV export/import)
5. Fault reporting & automatic risk scoring recalculation
6. Induction planner optimizer & what-if preview analysis
7. Plan approval & rejection workflows with audit trail
8. Printable PDF shift report generation
9. Constraints configuration, custom presets & reset-to-defaults
10. Timetable, Stations & Depot Bays management
11. Scheduler re-run with CP-SAT engine, KPI computation & history
12. Infeasibility diagnostics with plain-language explanations
13. Audit logs, Change logs & Reset to synthetic dataset
"""
import os
import io
import json
import tempfile
from datetime import date, timedelta
from fastapi.testclient import TestClient

# Setup disposable local test database
os.environ.pop("DATABASE_URL", None)
os.environ.pop("RENDER", None)
os.environ["APP_ENV"] = "development"
os.environ["METRO_DEMO_MODE"] = "true"
TEST_DIR = tempfile.mkdtemp(prefix="metro-e2e-", dir=os.path.dirname(os.path.abspath(__file__)))
os.environ["METRO_DB"] = os.path.join(TEST_DIR, "e2e_test.db")

from app.main import app
from app.db import init_db, SessionLocal, Train, JobCard, Plan, AuditEvent, ChangeLog
from app.seed import seed, seed_metadata
import app.risk as risk
import app.config as C

# Initialize and seed disposable test DB
init_db()
db = SessionLocal()
seed(db, include_demo_users=True)
seed_metadata(db)
risk.train_model(db)
risk.score_fleet(db)
db.commit()
db.close()

passed = 0
failed = 0

def step(title):
    print(f"\n=== {title} ===")

def check(name, condition, extra=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  [PASS] {name} {extra}")
    else:
        failed += 1
        print(f"  [FAIL] {name} {extra}")
        assert False, f"Check failed: {name} {extra}"

with TestClient(app) as client:
    # ---------------------------------------------------------
    # 1. Frontend & Static Asset Serving
    # ---------------------------------------------------------
    step("1. Frontend & Static Assets Serving")
    res = client.get("/")
    check("Root returns 200", res.status_code == 200)
    check("Root serves index.html", "<!doctype html>" in res.text.lower() or "metro" in res.text.lower())
    
    # SPA fallback for frontend paths
    res_spa = client.get("/trains")
    check("SPA routing fallback works for /trains", res_spa.status_code == 200 and "html" in res_spa.headers.get("content-type", ""))

    # Verify logo asset
    res_logo = client.get("/nagpur-metro-logo.png")
    check("Logo static asset exists", res_logo.status_code == 200 and len(res_logo.content) > 1000)

    # ---------------------------------------------------------
    # 2. Authentication & Authorization
    # ---------------------------------------------------------
    step("2. Authentication & Authorization")
    # Health check
    res_h = client.get("/api/health")
    check("Health check returns ok", res_h.status_code == 200 and res_h.json()["ok"] is True)

    # Invalid login
    res_bad = client.post("/api/login", json={"username": "officer", "password": "wrongpassword"})
    check("Invalid login rejected (401)", res_bad.status_code == 401)

    # Officer login
    res_off = client.post("/api/login", json={"username": "officer", "password": "officer123"})
    check("Officer login succeeded (200)", res_off.status_code == 200)
    officer_token = res_off.json()["token"]
    off_headers = {"Authorization": f"Bearer {officer_token}"}
    check("Officer role matches", res_off.json()["user"]["role"] == "officer")

    # Viewer login
    res_view = client.post("/api/login", json={"username": "viewer", "password": "viewer123"})
    check("Viewer login succeeded (200)", res_view.status_code == 200)
    viewer_token = res_view.json()["token"]
    view_headers = {"Authorization": f"Bearer {viewer_token}"}
    check("Viewer role matches", res_view.json()["user"]["role"] == "viewer")

    # /api/me check
    res_me = client.get("/api/me", headers=off_headers)
    check("/api/me returns correct officer profile", res_me.status_code == 200 and res_me.json()["role"] == "officer")

    # /api/refresh check
    res_ref = client.post("/api/refresh", headers=off_headers)
    check("Token refresh succeeds", res_ref.status_code == 200 and "token" in res_ref.json())

    # ---------------------------------------------------------
    # 3. Overview & Fleet Alerts
    # ---------------------------------------------------------
    step("3. Overview & Fleet Alerts")
    res_ov = client.get("/api/overview", headers=off_headers)
    check("Overview returns 200", res_ov.status_code == 200)
    ov_data = res_ov.json()
    check("Fleet size is 23", ov_data["fleet_size"] == 23)
    check("Alerts array populated", isinstance(ov_data["alerts"], list) and len(ov_data["alerts"]) > 0)
    check("Alert counts categorized", "critical" in ov_data["alert_counts"] and "warning" in ov_data["alert_counts"])

    # ---------------------------------------------------------
    # 4. Fleet Management & CRUD + CSV Import/Export
    # ---------------------------------------------------------
    step("4. Fleet Management (CRUD + CSV)")
    res_trains = client.get("/api/trains", headers=off_headers)
    check("List trains returns 23 trains", res_trains.status_code == 200 and len(res_trains.json()) == 23)

    # Train detail
    res_t1 = client.get("/api/trains/NMR-01", headers=off_headers)
    check("Get train detail returns NMR-01", res_t1.status_code == 200 and res_t1.json()["code"] == "NMR-01")
    t1_data = res_t1.json()
    check("NMR-01 has risk score", 0 <= t1_data["risk"] <= 1)
    check("NMR-01 has risk factors", len(t1_data.get("risk_factors", [])) >= 2)

    # Create new train
    new_train = {
        "code": "NMR-24",
        "line": "line_1",
        "depot": "Milan Depot (Khapri)",
        "track": "S-08",
        "track_position": 1,
        "status": "standby",
        "cert_expiry": (date.today() + timedelta(days=90)).isoformat(),
        "km_since_overhaul": 1200.0,
        "total_km": 15000.0,
        "branding_partner": "Nagpur Smart City",
        "branding_priority": "high"
    }
    # Viewer should be forbidden from creating train
    res_forbid = client.post("/api/trains", json=new_train, headers=view_headers)
    check("Viewer forbidden from adding train (403)", res_forbid.status_code == 403)

    # Officer creates train
    res_cr = client.post("/api/trains", json=new_train, headers=off_headers)
    check("Officer creates train NMR-24 (200)", res_cr.status_code == 200 and res_cr.json()["code"] == "NMR-24")

    # Update train
    res_up = client.put("/api/trains/NMR-24", json={"km_since_overhaul": 1800.0, "status": "service"}, headers=off_headers)
    check("Update train NMR-24 succeeds", res_up.status_code == 200 and res_up.json()["km_since_overhaul"] == 1800.0)

    # CSV Export
    res_csv = client.get("/api/trains/export.csv", headers=off_headers)
    check("Export trains to CSV succeeds", res_csv.status_code == 200 and "NMR-24" in res_csv.text)

    # CSV Import
    csv_content = (
        "code,line,depot,track,track_position,status,cert_expiry,km_since_overhaul,total_km,last_cleaned,branding_partner,branding_priority\n"
        f"NMR-24,line_1,Milan Depot (Khapri),S-08,1,service,{(date.today() + timedelta(days=90)).isoformat()},2200.0,16000.0,,Nagpur Smart City,high\n"
    )
    res_imp = client.post(
        "/api/trains/import.csv",
        files={"file": ("trains.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
        headers=off_headers
    )
    check("Import trains CSV succeeds", res_imp.status_code == 200 and res_imp.json()["updated"] >= 1)

    # Verify updated value
    res_t24 = client.get("/api/trains/NMR-24", headers=off_headers)
    check("NMR-24 km updated from CSV import", res_t24.status_code == 200 and res_t24.json()["km_since_overhaul"] == 2200.0)

    # Delete train NMR-24 to return fleet to 23
    res_del = client.delete("/api/trains/NMR-24", headers=off_headers)
    check("Delete train NMR-24 succeeds", res_del.status_code == 200 and res_del.json()["deleted"] == "NMR-24")

    # ---------------------------------------------------------
    # 5. Fault Reporting & Risk Recalculation
    # ---------------------------------------------------------
    step("5. Fault Reporting & Risk Recalculation")
    # Record current risk of NMR-05
    t5_initial = client.get("/api/trains/NMR-05", headers=off_headers).json()
    initial_risk = t5_initial["risk"]

    # Report serious fault
    res_fault = client.post("/api/trains/NMR-05/faults", json={
        "description": "Brake pressure regulator failure",
        "severity": "high"
    }, headers=off_headers)
    check("Report serious fault on NMR-05 succeeds", res_fault.status_code == 200)
    
    # Retrieve fault id from train detail
    t5_after_fault = client.get("/api/trains/NMR-05", headers=off_headers).json()
    fault_id = next(f["id"] for f in t5_after_fault["faults"] if f["description"] == "Brake pressure regulator failure")
    check("NMR-05 risk increased after high fault", t5_after_fault["risk"] >= initial_risk)
    check("NMR-05 now has open serious fault", t5_after_fault["serious_faults"] >= 1)

    # Resolve fault
    res_res = client.post(f"/api/faults/{fault_id}/resolve", headers=off_headers)
    check("Resolve fault succeeds", res_res.status_code == 200)

    # Verify risk returned down
    t5_resolved = client.get("/api/trains/NMR-05", headers=off_headers).json()
    check("NMR-05 risk decreased after resolution", t5_resolved["risk"] <= t5_after_fault["risk"])

    # ---------------------------------------------------------
    # 6. Induction Planner & What-If Analysis
    # ---------------------------------------------------------
    step("6. Induction Planner & What-If Analysis")
    # Strategies
    res_strat = client.get("/api/strategies", headers=off_headers)
    check("Strategies list returns 3 strategies", res_strat.status_code == 200 and len(res_strat.json()) == 3)

    # Preview plan with what-if manual change
    res_prev = client.post("/api/plan/preview", json={
        "strategy": "safest",
        "changes": {"NMR-05": "maintenance"}
    }, headers=off_headers)
    check("Preview plan with what-if succeeds", res_prev.status_code == 200)
    prev_entries = res_prev.json()["entries"]
    nmr5_entry = next(e for e in prev_entries if e["code"] == "NMR-05")
    check("NMR-05 assigned to maintenance in what-if preview", nmr5_entry["assignment"] == "maintenance")

    # Generate new plan
    res_plan = client.post("/api/plan", json={
        "strategy": "even_wear",
        "changes": {}
    }, headers=off_headers)
    check("Generate new plan succeeds", res_plan.status_code == 200)
    plan_obj = res_plan.json()
    check("Plan status is proposed", plan_obj["status"] == "proposed")
    check("Both lines covered (Line 1: 8, Line 2: 8)",
          plan_obj["summary"]["coverage"]["line_1"]["have"] == 8 and
          plan_obj["summary"]["coverage"]["line_2"]["have"] == 8)

    # Reject plan
    res_rej = client.post("/api/plan/reject", json={"notes": "Testing rejection flow"}, headers=off_headers)
    check("Reject plan succeeds", res_rej.status_code == 200 and res_rej.json()["status"] == "rejected")

    # Create fresh plan and approve it
    client.post("/api/plan", json={"strategy": "safest", "changes": {}}, headers=off_headers)
    res_app = client.post("/api/plan/approve", json={"notes": "Night shift approved plan"}, headers=off_headers)
    check("Approve plan succeeds", res_app.status_code == 200 and res_app.json()["status"] == "approved")

    # ---------------------------------------------------------
    # 7. PDF Report Generation
    # ---------------------------------------------------------
    step("7. PDF Shift Report Generation")
    res_pdf = client.get("/api/plan/report", headers=off_headers)
    check("Download PDF report returns 200", res_pdf.status_code == 200)
    check("Response header indicates application/pdf", "application/pdf" in res_pdf.headers.get("content-type", ""))
    check("PDF content is valid (starts with %PDF-)", res_pdf.content.startswith(b"%PDF-"))
    check("PDF has reasonable file size (> 2KB)", len(res_pdf.content) > 2000)

    # ---------------------------------------------------------
    # 8. Constraints, Timetable, Stations & Depots
    # ---------------------------------------------------------
    step("8. Constraints, Timetable, Stations & Depots")
    # Constraints
    res_con = client.get("/api/constraints", headers=off_headers)
    check("Get constraints returns 200", res_con.status_code == 200)
    con_data = res_con.json()
    check("Constraints list has at least 8 constraints", len(con_data["constraints"]) >= 8)

    # Update constraint
    res_con_up = client.put("/api/constraints", json={
        "constraints": [{"key": "max_standby", "enabled": True, "is_hard": False, "weight": 3.5, "value": 7}]
    }, headers=off_headers)
    check("Update constraint succeeds", res_con_up.status_code == 200)

    # Save Custom Preset
    res_pre_save = client.post("/api/constraints/presets", json={
        "name": "E2E Custom Preset",
        "description": "Preset created during E2E verification",
        "config": {"max_standby": {"weight": 3.5, "value": 7}}
    }, headers=off_headers)
    check("Save custom preset succeeds", res_pre_save.status_code == 200)
    preset_id = res_pre_save.json()["id"]

    # Apply Preset
    res_pre_apply = client.post(f"/api/constraints/presets/{preset_id}/apply", headers=off_headers)
    check("Apply preset succeeds", res_pre_apply.status_code == 200)

    # Reset Defaults
    res_con_reset = client.post("/api/constraints/reset-defaults", headers=off_headers)
    check("Reset constraints to defaults succeeds", res_con_reset.status_code == 200)

    # Timetable
    res_tt = client.get("/api/timetable", headers=off_headers)
    check("Get timetable parameters succeeds", res_tt.status_code == 200 and len(res_tt.json()) >= 2)

    # Stations CRUD
    new_station = {"code": "E2ESTN", "name": "E2E Test Station", "line": "line_1", "order_in_line": 99}
    res_stn = client.post("/api/stations", json=new_station, headers=off_headers)
    check("Create station succeeds", res_stn.status_code == 200 and res_stn.json()["code"] == "E2ESTN")

    res_stn_del = client.delete("/api/stations/E2ESTN", headers=off_headers)
    check("Delete station succeeds", res_stn_del.status_code == 200)

    # Depot Bays CRUD
    new_bay = {"depot": "Milan Depot (Khapri)", "bay_number": "M-TEST", "bay_type": "stabling", "capacity": 2, "line": "line_1"}
    res_bay = client.post("/api/depots", json=new_bay, headers=off_headers)
    check("Create depot bay succeeds", res_bay.status_code == 200)
    bay_id = res_bay.json()["id"]

    res_bay_del = client.delete(f"/api/depots/{bay_id}", headers=off_headers)
    check("Delete depot bay succeeds", res_bay_del.status_code == 200)

    # ---------------------------------------------------------
    # 9. Scheduler Re-run & Infeasibility Diagnostics
    # ---------------------------------------------------------
    step("9. Scheduler Re-run & Infeasibility Diagnostics")
    res_sched = client.post("/api/schedule/run", json={"strategy": "safest", "save": True}, headers=off_headers)
    check("Schedule re-run succeeds", res_sched.status_code == 200)
    sched_data = res_sched.json()
    check("KPIs returned", "kpis" in sched_data and "mileage_variance" in sched_data["kpis"])

    # Schedule history
    res_hist = client.get("/api/schedule/history", headers=off_headers)
    check("Schedule history contains executions", res_hist.status_code == 200 and len(res_hist.json()) >= 1)

    # Test Infeasibility Diagnostic (impose impossible hard constraint)
    client.put("/api/constraints", json={
        "constraints": [{"key": "min_service_l1", "enabled": True, "is_hard": True, "weight": 10.0, "value": 30}]
    }, headers=off_headers)
    res_infeasible = client.post("/api/schedule/run", json={"strategy": "safest", "save": False}, headers=off_headers)
    check("Infeasible constraint returns 422", res_infeasible.status_code == 422)
    err_detail = res_infeasible.json()["detail"]
    check("Infeasibility explanation is human-readable", "Fleet shortage" in err_detail or "Constraint Conflict" in err_detail)

    # Revert constraint
    client.post("/api/constraints/reset-defaults", headers=off_headers)

    # ---------------------------------------------------------
    # 10. Audit Log, Change Log & Reset Synthetic Data
    # ---------------------------------------------------------
    step("10. Audit Log, Change Log & Reset Synthetic Data")
    res_audit = client.get("/api/audit", headers=off_headers)
    check("Audit trail recorded actions", res_audit.status_code == 200 and res_audit.json()["total"] > 0)

    res_change = client.get("/api/changelog", headers=off_headers)
    check("Change log recorded entity updates", res_change.status_code == 200 and res_change.json()["total"] > 0)

    res_reset = client.post("/api/reset-synthetic-data", headers=off_headers)
    check("Reset to original synthetic data succeeds", res_reset.status_code == 200 and res_reset.json()["ok"] is True)

print(f"\n==========================================")
print(f"E2E TEST SUMMARY: {passed} PASSED, {failed} FAILED")
print(f"==========================================")
if failed > 0:
    raise SystemExit(1)
