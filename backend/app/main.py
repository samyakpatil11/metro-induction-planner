"""
The web API. Every route is short and does one thing.
Run:  python run.py     (from the project folder)
"""
import json
import csv
import io
import math
from contextlib import asynccontextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Union

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from . import config as C, risk, optimizer
from .alerts import build_alerts
from .auth import check_password, current_user, hash_password, make_token, officer_only
from .db import (
    Train, JobCard, Plan, User, AuditEvent, ChangeLog, ConstraintConfig,
    ConstraintPreset, TimetableParam, Station, DepotBay,
    SessionLocal, engine, get_db, init_db
)
from .report import build_pdf
from .seed import seed, seed_users, seed_metadata, reset_to_synthetic

STATIC_DIR = Path(__file__).parent / "static"
limiter = Limiter(key_func=get_remote_address, default_limits=[])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def plan_dict(p: Optional[Plan]):
    if not p:
        return None
    summary_data = json.loads(p.summary) if p.summary else {}
    return {
        "id": p.id,
        "plan_date": p.plan_date,
        "strategy": p.strategy,
        "status": p.status,
        "entries": json.loads(p.entries) if p.entries else [],
        "summary": summary_data,
        "notes": p.notes,
        "decided_by": p.decided_by,
        "decided_at": p.decided_at,
        "created_by": p.created_by,
        "created_at": p.created_at
    }


def latest_plan(db: Session) -> Optional[Plan]:
    """Return the most recent plan regardless of status (used internally)."""
    return db.query(Plan).order_by(Plan.id.desc()).first()


def latest_active_plan(db: Session) -> Optional[Plan]:
    """Return latest approved or proposed plan (skips rejected ones for display)."""
    return (
        db.query(Plan)
        .filter(Plan.status.in_(["approved", "proposed"]))
        .order_by(Plan.id.desc())
        .first()
    )


def all_trains(db: Session):
    return db.query(Train).order_by(Train.code).all()


def load_active_constraints(db: Session) -> Dict[str, dict]:
    """Load constraints from DB as dictionary for CP-SAT."""
    configs = db.query(ConstraintConfig).all()
    out = {}
    for c in configs:
        out[c.key] = {
            "name": c.name,
            "category": c.category,
            "enabled": c.enabled,
            "is_hard": c.is_hard,
            "weight": c.weight,
            "value": c.get_value(),
        }
    return out


def load_timetable_map(db: Session) -> Dict[str, dict]:
    """Load timetable parameters per line from DB."""
    tparams = db.query(TimetableParam).all()
    out = {}
    for tp in tparams:
        out[tp.line] = {
            "first_train_time": tp.first_train_time,
            "last_train_time": tp.last_train_time,
            "peak_headway_min": tp.peak_headway_min,
            "off_peak_headway_min": tp.off_peak_headway_min,
            "trips_per_train": tp.trips_per_train,
            "service_needed": tp.service_needed,
            "corridor_km": tp.corridor_km,
        }
    return out


def make_plan(db: Session, strategy: str, changes: Dict[str, str], who: str, save=True):
    """Run the optimizer with dynamic DB constraints and timetable parameters."""
    if strategy not in C.STRATEGIES:
        raise HTTPException(400, "Unknown priority.")
    constraints = load_active_constraints(db)
    timetable = load_timetable_map(db)

    trains = all_trains(db)
    rows = optimizer.build_rows(trains, constraints)
    try:
        result = optimizer.solve(rows, strategy, changes, constraints=constraints, timetable=timetable)
    except RuntimeError as e:
        raise HTTPException(422, str(e))

    if not save:
        return result
    p = Plan(
        plan_date=date.today(),
        strategy=strategy,
        entries=json.dumps(result["entries"]),
        summary=json.dumps(result["summary"]),
        created_by=who
    )
    db.add(p)
    db.commit()
    return p


def train_summary(t: Train, entry: Optional[dict]):
    return {
        "id": t.id,
        "code": t.code,
        "line": t.line,
        "line_name": C.LINE_NAMES.get(t.line, t.line),
        "depot": t.depot,
        "track": t.track,
        "track_position": t.track_position,
        "cert_expiry": t.cert_expiry.isoformat() if t.cert_expiry else None,
        "cert_days_left": t.cert_days_left,
        "km_since_overhaul": round(t.km_since_overhaul, 1),
        "total_km": round(t.total_km, 1),
        "last_cleaned": t.last_cleaned.isoformat() if t.last_cleaned else None,
        "cleaning_due": t.cleaning_due,
        "branding_partner": t.branding_partner,
        "branding_priority": t.branding_priority,
        "status": t.status,
        "open_faults": len(t.open_cards),
        "serious_faults": len(t.serious_cards),
        "risk": t.risk,
        "risk_level": C.risk_level(t.risk),
        "tonight": entry["assignment"] if entry else None,
        "serves": entry["serves"] if entry else None,
        "tonight_reason": entry["reason"] if entry else None,
    }


def entries_by_code(plan: Optional[Plan]):
    return {e["code"]: e for e in json.loads(plan.entries)} if plan and plan.entries else {}


def record_audit(db: Session, user: User, action: str, entity: str, entity_id=None, details=None):
    db.add(AuditEvent(
        actor=user.name,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        details=json.dumps(details or {}, ensure_ascii=False)
    ))


def record_change(db: Session, user: User, entity_type: str, entity_id: str,
                  action: str, field_name: str = "all", old_val=None, new_val=None):
    def _ser(v):
        if v is None:
            return ""
        if isinstance(v, (dict, list)):
            return json.dumps(v)
        return str(v)

    db.add(ChangeLog(
        user=user.name,
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
        field_name=field_name,
        old_value=_ser(old_val),
        new_value=_ser(new_val),
    ))


# ---------------------------------------------------------------------------
# Request bodies & Pydantic Validation
# ---------------------------------------------------------------------------
class LoginBody(BaseModel):
    username: str
    password: str


class PlanBody(BaseModel):
    strategy: str = C.DEFAULT_STRATEGY
    changes: Dict[str, str] = Field(default_factory=dict)   # {"NMR-05": "maintenance"}


class DecisionBody(BaseModel):
    notes: str = ""


class FaultBody(BaseModel):
    description: str = Field(min_length=3, max_length=120)
    severity: str = "low"

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v):
        if v not in ("high", "low"):
            raise ValueError("severity must be 'high' or 'low'")
        return v


class TrainCreateBody(BaseModel):
    code: str = Field(min_length=3, max_length=16, pattern=r"^[A-Z0-9\-]+$")
    line: str = Field(default="line_1")
    depot: str
    track: Optional[str] = "S-01"
    track_position: int = Field(default=1, ge=1, le=2)
    status: str = Field(default="standby")
    cert_expiry: date
    km_since_overhaul: float = Field(default=0.0, ge=0)
    total_km: float = Field(default=0.0, ge=0)
    last_cleaned: Optional[date] = None
    branding_partner: Optional[str] = None
    branding_priority: str = Field(default="none")

    @field_validator("line")
    @classmethod
    def validate_line(cls, v):
        if v not in ("line_1", "line_2", "spare"):
            raise ValueError("line must be 'line_1', 'line_2', or 'spare'")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v not in ("service", "maintenance", "standby"):
            raise ValueError("status must be 'service', 'maintenance', or 'standby'")
        return v

    @field_validator("branding_priority")
    @classmethod
    def validate_branding(cls, v):
        if v not in ("high", "medium", "none"):
            raise ValueError("branding_priority must be 'high', 'medium', or 'none'")
        return v


class TrainUpdateBody(BaseModel):
    line: Optional[str] = None
    depot: Optional[str] = None
    track: Optional[str] = None
    track_position: Optional[int] = Field(default=None, ge=1, le=2)
    status: Optional[str] = None
    cert_expiry: Optional[date] = None
    km_since_overhaul: Optional[float] = Field(default=None, ge=0)
    total_km: Optional[float] = Field(default=None, ge=0)
    last_cleaned: Optional[date] = None
    branding_partner: Optional[str] = None
    branding_priority: Optional[str] = None

    @field_validator("line")
    @classmethod
    def validate_line(cls, v):
        if v is not None and v not in ("line_1", "line_2", "spare"):
            raise ValueError("line must be 'line_1', 'line_2', or 'spare'")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in ("service", "maintenance", "standby"):
            raise ValueError("status must be 'service', 'maintenance', or 'standby'")
        return v

    @field_validator("branding_priority")
    @classmethod
    def validate_branding(cls, v):
        if v is not None and v not in ("high", "medium", "none"):
            raise ValueError("branding_priority must be 'high', 'medium', or 'none'")
        return v


class TimetableParamBody(BaseModel):
    line_name: Optional[str] = None
    first_train_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    last_train_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    peak_headway_min: int = Field(ge=2, le=120)
    off_peak_headway_min: int = Field(ge=2, le=120)
    trips_per_train: int = Field(ge=1, le=50)
    service_needed: int = Field(ge=1, le=30)
    corridor_km: float = Field(ge=1.0, le=200.0)


class StationCreateBody(BaseModel):
    code: str = Field(min_length=2, max_length=10, pattern=r"^[A-Z0-9]+$")
    name: str = Field(min_length=2, max_length=100)
    line: str = Field(default="line_1")
    order_in_line: int = Field(default=1, ge=1)
    interchange: bool = False
    terminal: bool = False
    depot_attached: Optional[str] = None


class StationUpdateBody(BaseModel):
    name: Optional[str] = None
    line: Optional[str] = None
    order_in_line: Optional[int] = Field(default=None, ge=1)
    interchange: Optional[bool] = None
    terminal: Optional[bool] = None
    depot_attached: Optional[str] = None


class DepotBayCreateBody(BaseModel):
    depot: str = Field(min_length=2, max_length=100)
    bay_number: str = Field(min_length=1, max_length=20)
    bay_type: str = Field(default="stabling")  # stabling, maintenance, wash_plant
    capacity: int = Field(default=2, ge=1, le=10)
    line: str = Field(default="line_1")
    notes: Optional[str] = None

    @field_validator("bay_type")
    @classmethod
    def validate_type(cls, v):
        if v not in ("stabling", "maintenance", "wash_plant"):
            raise ValueError("bay_type must be 'stabling', 'maintenance', or 'wash_plant'")
        return v


class DepotBayUpdateBody(BaseModel):
    depot: Optional[str] = None
    bay_number: Optional[str] = None
    bay_type: Optional[str] = None
    capacity: Optional[int] = Field(default=None, ge=1, le=10)
    line: Optional[str] = None
    notes: Optional[str] = None


class ConstraintUpdateItem(BaseModel):
    key: str
    enabled: Optional[bool] = None
    is_hard: Optional[bool] = None
    weight: Optional[float] = Field(default=None, ge=0.0, le=20.0)
    value: Optional[Union[int, float, str, dict, list]] = None


class ConstraintBatchUpdateBody(BaseModel):
    constraints: List[ConstraintUpdateItem]


class PresetSaveBody(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    description: Optional[str] = ""
    config: Dict[str, Any]


class ScheduleRunBody(BaseModel):
    strategy: str = C.DEFAULT_STRATEGY
    changes: Dict[str, str] = Field(default_factory=dict)
    save: bool = True


class CloseDayBody(BaseModel):
    km_accrued: Optional[Dict[str, float]] = None  # {"NMR-01": 169.3, ...} optional override


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(503, "Database unavailable.")
    return {"ok": True, "simulation_mode": C.SIMULATION_MODE}


@api.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginBody, db: Session = Depends(get_db)):
    """Authenticate with username + password. Returns a bearer token valid for 12 hours."""
    user = db.query(User).filter(User.username == body.username.strip().lower()).first()
    if not user or not check_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong username or password.")
    return {"token": make_token(user), "user": {"name": user.name, "role": user.role}}


@api.get("/me")
def me(user: User = Depends(current_user)):
    return {"name": user.name, "role": user.role}


@api.post("/refresh")
def refresh_token(user: User = Depends(current_user)):
    """Issue a fresh token. Call before expiry so officers aren't kicked mid-shift."""
    return {"token": make_token(user), "user": {"name": user.name, "role": user.role}}


@api.get("/strategies")
def strategies(user: User = Depends(current_user)):
    return [{"id": k, "label": v["label"], "description": v["description"]} for k, v in C.STRATEGIES.items()]


@api.get("/overview")
def overview(user: User = Depends(current_user), db: Session = Depends(get_db)):
    plan = plan_dict(latest_plan(db))
    alerts = build_alerts(all_trains(db), plan)
    return {
        "plan": plan and {k: plan[k] for k in ("id", "status", "strategy", "decided_by", "decided_at", "summary", "notes")},
        "alerts": alerts,
        "alert_counts": {lvl: sum(1 for a in alerts if a["level"] == lvl) for lvl in ("critical", "warning", "info")},
        "fleet_size": db.query(Train).count(),
        "simulation_mode": C.SIMULATION_MODE,
        "risk_model_mode": risk.model_mode(),
    }


# ===========================================================================
# 1. FLEET & TRAIN DATA MANAGEMENT (CRUD, CSV Import/Export)
# ===========================================================================
@api.get("/trains")
def list_trains(user: User = Depends(current_user), db: Session = Depends(get_db)):
    by_code = entries_by_code(latest_plan(db))
    return [train_summary(t, by_code.get(t.code)) for t in all_trains(db)]


@api.get("/trains/export.csv")
def export_trains(user: User = Depends(current_user), db: Session = Depends(get_db)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "code", "line", "depot", "track", "track_position", "status",
        "cert_expiry", "km_since_overhaul", "total_km", "last_cleaned",
        "branding_partner", "branding_priority"
    ])
    for t in all_trains(db):
        writer.writerow([
            t.code, t.line, t.depot, t.track or "", t.track_position or 1, t.status or "standby",
            t.cert_expiry.isoformat() if t.cert_expiry else "",
            t.km_since_overhaul, t.total_km,
            t.last_cleaned.isoformat() if t.last_cleaned else "",
            t.branding_partner or "", t.branding_priority or "none"
        ])
    return StreamingResponse(
        iter(["\ufeff" + output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=nagpur-metro-fleet.csv"}
    )


@api.post("/trains/import.csv")
async def import_trains_csv(
    file: UploadFile = File(...),
    user: User = Depends(officer_only),
    db: Session = Depends(get_db)
):
    """Bulk import or update trains via CSV."""
    contents = await file.read()
    text_content = contents.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text_content))
    created, updated = 0, 0

    for row in reader:
        code = (row.get("code") or row.get("train") or "").strip().upper()
        if not code:
            continue
        line = (row.get("line") or "line_1").strip().lower()
        if line not in ("line_1", "line_2", "spare"):
            line = "spare" if "spare" in line else ("line_2" if "2" in line or "aqua" in line else "line_1")
        depot = (row.get("depot") or C.DEPOTS.get(line if line != "spare" else "line_1")).strip()
        track = (row.get("track") or "S-01").strip()
        pos = int(row.get("track_position") or 1)
        status = (row.get("status") or "standby").strip().lower()
        if status not in ("service", "maintenance", "standby"):
            status = "standby"

        # parse dates
        cert_raw = (row.get("cert_expiry") or "").strip()
        try:
            cert_expiry = date.fromisoformat(cert_raw) if cert_raw else date.today()
        except ValueError:
            cert_expiry = date.today()

        cleaned_raw = (row.get("last_cleaned") or "").strip()
        try:
            last_cleaned = date.fromisoformat(cleaned_raw) if cleaned_raw else None
        except ValueError:
            last_cleaned = None

        km = float(row.get("km_since_overhaul") or 0.0)
        tot_km = float(row.get("total_km") or km)
        partner = (row.get("branding_partner") or "").strip() or None
        priority = (row.get("branding_priority") or "none").strip().lower()
        if priority not in ("high", "medium", "none"):
            priority = "none"

        existing = db.query(Train).filter(Train.code == code).first()
        if existing:
            old_data = {"status": existing.status, "km": existing.km_since_overhaul, "depot": existing.depot}
            existing.line = line
            existing.depot = depot
            existing.track = track
            existing.track_position = pos
            existing.status = status
            existing.cert_expiry = cert_expiry
            existing.km_since_overhaul = km
            existing.total_km = tot_km
            existing.last_cleaned = last_cleaned
            existing.branding_partner = partner
            existing.branding_priority = priority
            record_change(db, user, "train", code, "update", "csv_import", old_data, {"status": status, "km": km})
            updated += 1
        else:
            new_train = Train(
                code=code, line=line, depot=depot, track=track, track_position=pos,
                status=status, cert_expiry=cert_expiry, km_since_overhaul=km,
                total_km=tot_km, last_cleaned=last_cleaned, branding_partner=partner,
                branding_priority=priority
            )
            db.add(new_train)
            record_change(db, user, "train", code, "create", "csv_import", None, {"code": code, "line": line})
            created += 1

    db.commit()
    risk.score_fleet(db)
    return {"ok": True, "created": created, "updated": updated}


@api.post("/trains")
def create_train(body: TrainCreateBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    code = body.code.upper().strip()
    if db.query(Train).filter(Train.code == code).first():
        raise HTTPException(409, f"Train {code} already exists.")

    train = Train(
        code=code,
        line=body.line,
        depot=body.depot,
        track=body.track,
        track_position=body.track_position,
        status=body.status,
        cert_expiry=body.cert_expiry,
        km_since_overhaul=body.km_since_overhaul,
        total_km=body.total_km,
        last_cleaned=body.last_cleaned,
        branding_partner=body.branding_partner,
        branding_priority=body.branding_priority,
    )
    db.add(train)
    db.flush()
    record_change(db, user, "train", code, "create", "all", None, body.model_dump(mode="json"))
    record_audit(db, user, "train_created", "train", code, body.model_dump(mode="json"))
    db.commit()
    risk.score_fleet(db)
    return train_summary(train, None)


@api.get("/trains/{code}")
def train_detail(code: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.query(Train).filter(Train.code == code.upper()).first()
    if not t:
        raise HTTPException(404, "Train not found.")
    out = train_summary(t, entries_by_code(latest_plan(db)).get(t.code))
    cards = sorted(t.job_cards, key=lambda c: (c.status != "open", -c.id))
    out.update({
        "track": t.track,
        "track_position": t.track_position,
        "branding_priority": t.branding_priority,
        "overhaul_limit_km": C.OVERHAUL_KM,
        "risk_factors": t.factors,
        "faults": [{"id": c.id, "description": c.description, "severity": c.severity, "status": c.status,
                    "opened": c.opened, "closed": c.closed} for c in cards],
    })
    return out


@api.put("/trains/{code}")
def update_train(code: str, body: TrainUpdateBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    t = db.query(Train).filter(Train.code == code.upper()).first()
    if not t:
        raise HTTPException(404, "Train not found.")

    old_vals = {
        "line": t.line, "depot": t.depot, "track": t.track, "track_position": t.track_position,
        "status": t.status, "cert_expiry": t.cert_expiry.isoformat() if t.cert_expiry else None,
        "km_since_overhaul": t.km_since_overhaul, "total_km": t.total_km,
        "last_cleaned": t.last_cleaned.isoformat() if t.last_cleaned else None,
        "branding_partner": t.branding_partner, "branding_priority": t.branding_priority
    }

    updates = body.model_dump(exclude_unset=True)
    for field, val in updates.items():
        setattr(t, field, val)

    record_change(db, user, "train", code, "update", "multiple", old_vals, updates)
    record_audit(db, user, "train_updated", "train", code, updates)
    db.commit()
    risk.score_fleet(db)
    return train_summary(t, entries_by_code(latest_plan(db)).get(t.code))


@api.delete("/trains/{code}")
def delete_train(code: str, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    t = db.query(Train).filter(Train.code == code.upper()).first()
    if not t:
        raise HTTPException(404, "Train not found.")

    old_data = {"code": t.code, "line": t.line, "depot": t.depot}
    db.delete(t)
    record_change(db, user, "train", code, "delete", "all", old_data, None)
    record_audit(db, user, "train_deleted", "train", code, old_data)
    db.commit()
    risk.score_fleet(db)
    return {"ok": True, "deleted": code}


@api.post("/trains/{code}/faults")
def report_fault(code: str, body: FaultBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    """Report a new fault on a train. Severity 'high' blocks the train from service."""
    t = db.query(Train).filter(Train.code == code.upper()).first()
    if not t:
        raise HTTPException(404, "Train not found.")
    card = JobCard(train_id=t.id, description=body.description.strip(), severity=body.severity)
    db.add(card)
    db.flush()
    record_audit(db, user, "fault_reported", "train", t.code,
                 {"fault_id": card.id, "severity": body.severity, "description": body.description.strip()})
    record_change(db, user, "job_card", str(card.id), "create", "all", None,
                  {"train": t.code, "description": body.description.strip(), "severity": body.severity})
    db.commit()
    risk.score_fleet(db)
    return {"ok": True}


@api.post("/faults/{fault_id}/resolve")
def resolve_fault(fault_id: int, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    c = db.get(JobCard, fault_id)
    if not c:
        raise HTTPException(404, "Fault not found.")
    c.status, c.closed = "closed", date.today()
    record_audit(db, user, "fault_resolved", "train", c.train.code,
                 {"fault_id": c.id, "description": c.description})
    record_change(db, user, "job_card", str(c.id), "update", "status", "open", "closed")
    db.commit()
    risk.score_fleet(db)
    return {"ok": True}


# ===========================================================================
# 2. TIMETABLE PARAMETERS (CRUD)
# ===========================================================================
@api.get("/timetable")
def get_timetable(user: User = Depends(current_user), db: Session = Depends(get_db)):
    params = db.query(TimetableParam).order_by(TimetableParam.line).all()
    return [{
        "id": p.id,
        "line": p.line,
        "line_name": p.line_name,
        "first_train_time": p.first_train_time,
        "last_train_time": p.last_train_time,
        "peak_headway_min": p.peak_headway_min,
        "off_peak_headway_min": p.off_peak_headway_min,
        "trips_per_train": p.trips_per_train,
        "service_needed": p.service_needed,
        "corridor_km": p.corridor_km,
    } for p in params]


@api.put("/timetable/{line}")
def update_timetable(line: str, body: TimetableParamBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    tp = db.query(TimetableParam).filter(TimetableParam.line == line.lower()).first()
    if not tp:
        raise HTTPException(404, "Timetable parameters for line not found.")

    old_data = {
        "first_train_time": tp.first_train_time,
        "last_train_time": tp.last_train_time,
        "peak_headway_min": tp.peak_headway_min,
        "off_peak_headway_min": tp.off_peak_headway_min,
        "trips_per_train": tp.trips_per_train,
        "service_needed": tp.service_needed,
        "corridor_km": tp.corridor_km,
    }
    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(tp, k, v)

    # Sync constraint table if service_needed changed
    c_key = "min_service_l1" if line == "line_1" else "min_service_l2"
    c_row = db.get(ConstraintConfig, c_key)
    if c_row and "service_needed" in updates:
        c_row.set_value(updates["service_needed"])

    record_change(db, user, "timetable", line, "update", "multiple", old_data, updates)
    record_audit(db, user, "timetable_updated", "timetable", line, updates)
    db.commit()
    return {
        "id": tp.id, "line": tp.line, "line_name": tp.line_name,
        "first_train_time": tp.first_train_time, "last_train_time": tp.last_train_time,
        "peak_headway_min": tp.peak_headway_min, "off_peak_headway_min": tp.off_peak_headway_min,
        "trips_per_train": tp.trips_per_train, "service_needed": tp.service_needed,
        "corridor_km": tp.corridor_km
    }


# ===========================================================================
# 3. STATIONS & DEPOTS (CRUD, CSV)
# ===========================================================================
@api.get("/stations")
def get_stations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    stations = db.query(Station).order_by(Station.line, Station.order_in_line).all()
    return [{
        "id": s.id,
        "code": s.code,
        "name": s.name,
        "line": s.line,
        "order_in_line": s.order_in_line,
        "interchange": s.interchange,
        "terminal": s.terminal,
        "depot_attached": s.depot_attached,
    } for s in stations]


@api.post("/stations")
def create_station(body: StationCreateBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    code = body.code.upper().strip()
    if db.query(Station).filter(Station.code == code).first():
        raise HTTPException(409, f"Station code {code} already exists.")

    stn = Station(
        code=code, name=body.name.strip(), line=body.line, order_in_line=body.order_in_line,
        interchange=body.interchange, terminal=body.terminal, depot_attached=body.depot_attached
    )
    db.add(stn)
    db.flush()
    data = body.model_dump()
    record_change(db, user, "station", code, "create", "all", None, data)
    db.commit()
    return {
        "id": stn.id, "code": stn.code, "name": stn.name, "line": stn.line,
        "order_in_line": stn.order_in_line, "interchange": stn.interchange,
        "terminal": stn.terminal, "depot_attached": stn.depot_attached
    }


@api.put("/stations/{code}")
def update_station(code: str, body: StationUpdateBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    stn = db.query(Station).filter(Station.code == code.upper()).first()
    if not stn:
        raise HTTPException(404, "Station not found.")

    old = {"name": stn.name, "line": stn.line, "order_in_line": stn.order_in_line}
    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(stn, k, v)
    record_change(db, user, "station", code, "update", "multiple", old, updates)
    db.commit()
    return {
        "id": stn.id, "code": stn.code, "name": stn.name, "line": stn.line,
        "order_in_line": stn.order_in_line, "interchange": stn.interchange,
        "terminal": stn.terminal, "depot_attached": stn.depot_attached
    }


@api.delete("/stations/{code}")
def delete_station(code: str, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    stn = db.query(Station).filter(Station.code == code.upper()).first()
    if not stn:
        raise HTTPException(404, "Station not found.")
    old = {"code": stn.code, "name": stn.name}
    db.delete(stn)
    record_change(db, user, "station", code, "delete", "all", old, None)
    db.commit()
    return {"ok": True, "deleted": code}


@api.get("/depots")
def get_depot_bays(user: User = Depends(current_user), db: Session = Depends(get_db)):
    bays = db.query(DepotBay).order_by(DepotBay.depot, DepotBay.bay_number).all()
    return [{
        "id": b.id,
        "depot": b.depot,
        "bay_number": b.bay_number,
        "bay_type": b.bay_type,
        "capacity": b.capacity,
        "line": b.line,
        "notes": b.notes,
    } for b in bays]


@api.post("/depots")
def create_depot_bay(body: DepotBayCreateBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    bay = DepotBay(
        depot=body.depot, bay_number=body.bay_number, bay_type=body.bay_type,
        capacity=body.capacity, line=body.line, notes=body.notes
    )
    db.add(bay)
    db.flush()
    record_change(db, user, "depot_bay", f"{bay.depot}_{bay.bay_number}", "create", "all", None, body.model_dump())
    db.commit()
    return {
        "id": bay.id, "depot": bay.depot, "bay_number": bay.bay_number,
        "bay_type": bay.bay_type, "capacity": bay.capacity, "line": bay.line, "notes": bay.notes
    }


@api.put("/depots/{bay_id}")
def update_depot_bay(bay_id: int, body: DepotBayUpdateBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    bay = db.get(DepotBay, bay_id)
    if not bay:
        raise HTTPException(404, "Depot bay not found.")
    old = {"capacity": bay.capacity, "type": bay.bay_type, "bay_number": bay.bay_number}
    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(bay, k, v)
    record_change(db, user, "depot_bay", str(bay_id), "update", "multiple", old, updates)
    db.commit()
    return {
        "id": bay.id, "depot": bay.depot, "bay_number": bay.bay_number,
        "bay_type": bay.bay_type, "capacity": bay.capacity, "line": bay.line, "notes": bay.notes
    }



@api.delete("/depots/{bay_id}")
def delete_depot_bay(bay_id: int, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    bay = db.get(DepotBay, bay_id)
    if not bay:
        raise HTTPException(404, "Depot bay not found.")
    old = {"depot": bay.depot, "bay_number": bay.bay_number}
    db.delete(bay)
    record_change(db, user, "depot_bay", str(bay_id), "delete", "all", old, None)
    db.commit()
    return {"ok": True, "deleted": bay_id}


# ===========================================================================
# 4. CONSTRAINT EDITOR & PRESETS
# ===========================================================================
@api.get("/constraints")
def get_constraints(user: User = Depends(current_user), db: Session = Depends(get_db)):
    configs = db.query(ConstraintConfig).order_by(ConstraintConfig.category, ConstraintConfig.key).all()
    presets = db.query(ConstraintPreset).order_by(ConstraintPreset.id).all()
    return {
        "constraints": [{
            "key": c.key,
            "name": c.name,
            "category": c.category,
            "description": c.description,
            "enabled": c.enabled,
            "is_hard": c.is_hard,
            "weight": c.weight,
            "value_type": c.value_type,
            "value": c.get_value(),
        } for c in configs],
        "presets": [{
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "is_default": p.is_default,
            "config": json.loads(p.config_json),
        } for p in presets],
    }


@api.put("/constraints")
def update_constraints(body: ConstraintBatchUpdateBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    for item in body.constraints:
        c = db.get(ConstraintConfig, item.key)
        if not c:
            continue
        old_val = {"enabled": c.enabled, "is_hard": c.is_hard, "weight": c.weight, "value": c.get_value()}
        if item.enabled is not None:
            c.enabled = item.enabled
        if item.is_hard is not None:
            c.is_hard = item.is_hard
        if item.weight is not None:
            c.weight = item.weight
        if item.value is not None:
            c.set_value(item.value)

        new_val = {"enabled": c.enabled, "is_hard": c.is_hard, "weight": c.weight, "value": c.get_value()}
        record_change(db, user, "constraint", item.key, "update", "config", old_val, new_val)

    record_audit(db, user, "constraints_updated", "constraints", "batch", {"count": len(body.constraints)})
    db.commit()
    return get_constraints(user, db)


@api.post("/constraints/presets")
def save_preset(body: PresetSaveBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    name = body.name.strip()
    existing = db.query(ConstraintPreset).filter(ConstraintPreset.name == name).first()
    if existing:
        existing.description = body.description
        existing.config_json = json.dumps(body.config)
        preset = existing
    else:
        preset = ConstraintPreset(name=name, description=body.description, config_json=json.dumps(body.config))
        db.add(preset)
    record_change(db, user, "preset", name, "save", "config", None, body.config)
    record_audit(db, user, "preset_saved", "preset", name, {"name": name})
    db.commit()
    return {"ok": True, "id": preset.id, "name": preset.name}


@api.post("/constraints/presets/{preset_id}/apply")
def apply_preset(preset_id: int, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    preset = db.get(ConstraintPreset, preset_id)
    if not preset:
        raise HTTPException(404, "Preset not found.")
    cfg = json.loads(preset.config_json)
    for key, vals in cfg.items():
        c = db.get(ConstraintConfig, key)
        if c:
            if "enabled" in vals:
                c.enabled = vals["enabled"]
            if "is_hard" in vals:
                c.is_hard = vals["is_hard"]
            if "weight" in vals:
                c.weight = vals["weight"]
            if "value" in vals:
                c.set_value(vals["value"])
    record_change(db, user, "constraint_preset", preset.name, "apply", "all", None, cfg)
    record_audit(db, user, "preset_applied", "preset", preset.name, {"name": preset.name})
    db.commit()
    return get_constraints(user, db)


@api.post("/constraints/reset-defaults")
def reset_constraints_defaults(user: User = Depends(officer_only), db: Session = Depends(get_db)):
    default_preset = db.query(ConstraintPreset).filter(ConstraintPreset.is_default == True).first()
    if not default_preset:
        default_preset = db.query(ConstraintPreset).filter(ConstraintPreset.name == "Normal day").first()
    if default_preset:
        apply_preset(default_preset.id, user, db)
    return get_constraints(user, db)


# ===========================================================================
# 5. SCHEDULER RE-RUN, COMPARE & HISTORY
# ===========================================================================
@api.post("/schedule/run")
def run_scheduler(body: ScheduleRunBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    """Run CP-SAT solver with current DB data + constraints and return plan + KPIs."""
    previous_plan = plan_dict(latest_plan(db))
    plan_obj = make_plan(db, body.strategy, body.changes, user.name, save=body.save)

    if body.save:
        record_audit(db, user, "scheduler_run", "plan", plan_obj.id, {"strategy": body.strategy})
        new_plan = plan_dict(plan_obj)
    else:
        new_plan = {
            "id": None,
            "plan_date": date.today(),
            "strategy": body.strategy,
            "status": "proposed",
            "entries": plan_obj["entries"],
            "summary": plan_obj["summary"],
            "created_by": user.name,
            "created_at": datetime.now(),
        }

    diff_list = optimizer.diff(previous_plan["entries"], new_plan["entries"]) if previous_plan else []
    return {
        "current_plan": new_plan,
        "previous_plan": previous_plan,
        "diff": diff_list,
        "kpis": new_plan["summary"].get("kpis", {}),
    }


@api.get("/schedule/history")
def get_schedule_history(limit: int = 15, user: User = Depends(current_user), db: Session = Depends(get_db)):
    plans = db.query(Plan).order_by(Plan.id.desc()).limit(limit).all()
    return [plan_dict(p) for p in plans]


# ===========================================================================
# 6. CHANGE LOG & RESET TO SYNTHETIC
# ===========================================================================
@api.get("/changelog")
def get_changelog(
    limit: int = 100,
    offset: int = 0,
    entity_type: Optional[str] = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    query = db.query(ChangeLog)
    if entity_type:
        query = query.filter(ChangeLog.entity_type == entity_type)
    total = query.count()
    rows = query.order_by(ChangeLog.id.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "logs": [{
            "id": r.id,
            "timestamp": r.timestamp.isoformat(),
            "user": r.user,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "action": r.action,
            "field_name": r.field_name,
            "old_value": r.old_value,
            "new_value": r.new_value,
        } for r in rows]
    }


@api.post("/reset-synthetic-data")
def reset_synthetic_endpoint(user: User = Depends(officer_only), db: Session = Depends(get_db)):
    """Reset to original synthetic data and constraints."""
    reset_to_synthetic(db)
    # create default first plan
    make_plan(db, C.DEFAULT_STRATEGY, {}, "System")
    record_audit(db, user, "reset_synthetic_data", "system", "all", {"message": "Reset to original synthetic fleet data"})
    return {"ok": True, "message": "Synthetic fleet and constraints successfully reset."}


# ===========================================================================
# Existing Core Routes (Plan preview, create, approve, reject, audit, report)
# ===========================================================================
@api.get("/plan")
def get_plan(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Return the latest approved or proposed plan (skips rejected plans)."""
    return plan_dict(latest_active_plan(db))


@api.post("/plan/preview")
def preview_plan(body: PlanBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """What-If: shows what would change, saves nothing."""
    current = plan_dict(latest_active_plan(db))
    result = make_plan(db, body.strategy, body.changes, user.name, save=False)
    return {**result, "changes": optimizer.diff(current["entries"], result["entries"]) if current else []}


@api.post("/plan")
def create_plan(body: PlanBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    plan = make_plan(db, body.strategy, body.changes, user.name)
    record_audit(db, user, "plan_created", "plan", plan.id,
                 {"date": str(plan.plan_date), "strategy": plan.strategy})
    db.commit()
    return plan_dict(plan)


def _decide(db: Session, user: User, status: str, notes: str):
    p = latest_plan(db)
    if not p or p.status != "proposed":
        raise HTTPException(409, "There is no plan waiting for a decision.")
    trains = {t.code: t for t in all_trains(db)}
    if status == "approved":
        # safety check against live train status
        for e in json.loads(p.entries):
            t = trains.get(e["code"])
            if not t:
                continue
            if e["assignment"] == "service" and (t.serious_cards or t.cert_days_left < 0 or t.km_since_overhaul >= C.OVERHAUL_KM):
                raise HTTPException(409, f"{t.code} is no longer safe for service. Please create a new plan.")
        for e in json.loads(p.entries):
            if e["code"] in trains:
                trains[e["code"]].status = e["assignment"]
    elif len(notes.strip()) < 3:
        raise HTTPException(400, "Please write a short reason for rejecting the plan.")
    p.status, p.notes, p.decided_by, p.decided_at = status, notes.strip(), user.name, datetime.now()
    record_audit(db, user, f"plan_{status}", "plan", p.id, {"notes": notes.strip()})
    db.commit()
    return plan_dict(p)


@api.post("/plan/approve")
def approve(body: DecisionBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    return _decide(db, user, "approved", body.notes)


@api.post("/plan/reject")
def reject(body: DecisionBody, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    return _decide(db, user, "rejected", body.notes)


@api.get("/plan/report")
def report(user: User = Depends(current_user), db: Session = Depends(get_db)):
    plan = plan_dict(latest_plan(db))
    if not plan:
        raise HTTPException(404, "No plan to print yet.")
    pdf = build_pdf(plan, build_alerts(all_trains(db), plan))
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="induction-plan-{plan["plan_date"]}.pdf"'})


@api.get("/audit")
def audit_events(limit: int = 100, offset: int = 0, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Return paginated audit events. Supports limit (max 250) and offset."""
    limit = min(max(limit, 1), 250)
    offset = max(offset, 0)
    query = db.query(AuditEvent).order_by(AuditEvent.id.desc())
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {
        "total": total,
        "events": [{
            "id": row.id, "occurred_at": row.occurred_at, "actor": row.actor,
            "action": row.action, "entity": row.entity, "entity_id": row.entity_id,
            "details": json.loads(row.details or "{}")
        } for row in rows]
    }


# ---------------------------------------------------------------------------
# App start-up: create data on first run, then serve the web page
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        if C.IS_PRODUCTION:
            db.query(User).filter(User.username.in_(["officer", "viewer"])).delete(synchronize_session=False)
            admin = db.query(User).filter(User.username == C.ADMIN_USERNAME).first()
            if admin is None:
                admin = User(username=C.ADMIN_USERNAME, name=C.ADMIN_NAME, role="officer",
                             password_hash=hash_password(C.ADMIN_PASSWORD))
                db.add(admin)
            else:
                admin.name = C.ADMIN_NAME
                admin.role = "officer"
                try:
                    password_matches = check_password(C.ADMIN_PASSWORD, admin.password_hash)
                except (ValueError, AttributeError):
                    password_matches = False
                if not password_matches:
                    admin.password_hash = hash_password(C.ADMIN_PASSWORD)
            db.commit()

        if db.query(Train).count() == 0:
            if C.IS_PRODUCTION and not C.SIMULATION_MODE:
                raise RuntimeError("No fleet data found. Load operational data or enable METRO_DEMO_MODE for a simulation deployment.")
            print("First run: creating synthetic fleet data ...")
            seed(db, include_demo_users=not C.IS_PRODUCTION)
        elif not C.IS_PRODUCTION and db.query(User).count() == 0:
            seed_users(db)

        # Seed constraint configs, timetable params, stations, depots
        seed_metadata(db)

        info = risk.train_model(db)
        risk.score_fleet(db)
        print(f"Risk model trained on {info['rows']} daily records.")
        if not latest_plan(db):
            make_plan(db, C.DEFAULT_STRATEGY, {}, "System")
            print("Created a first plan for tonight.")
    finally:
        db.close()
    yield


app = FastAPI(title="Metro Induction Planner", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api)

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found.")
        file = (STATIC_DIR / path).resolve()
        try:
            file.relative_to(STATIC_DIR.resolve())
        except ValueError:
            file = STATIC_DIR / "index.html"
        return FileResponse(file if path and file.is_file() else STATIC_DIR / "index.html")
