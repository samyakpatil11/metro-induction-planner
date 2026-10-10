"""Database models with SQLite for local use and PostgreSQL for hosted use."""
import json
import os
from datetime import datetime, date
from sqlalchemy import (create_engine, Column, Integer, String, Float, Date,
                        DateTime, Boolean, Text, ForeignKey, event)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

from .config import DB_PATH, IS_PRODUCTION

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if IS_PRODUCTION and not DATABASE_URL:
    raise RuntimeError("Production requires DATABASE_URL; SQLite on an ephemeral host is not persistent.")
if IS_PRODUCTION and not DATABASE_URL.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
    raise RuntimeError("Production DATABASE_URL must point to PostgreSQL; local SQLite files are not supported.")

if DATABASE_URL:
    # Providers commonly supply postgres:// or postgresql:// URLs. Use psycopg 3 explicitly.
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.removeprefix("postgres://")
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.removeprefix("postgresql://")
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # "officer" (can decide) or "viewer" (read only)


class Train(Base):
    __tablename__ = "trains"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, nullable=False)        # NMR-01
    line = Column(String, nullable=False)                     # line_1 / line_2 / spare
    depot = Column(String, nullable=False)
    track = Column(String)                                    # stabling track, e.g. "S-03"
    track_position = Column(Integer, default=1)               # 1 = front (easy exit), 2 = behind another train
    status = Column(String, default="standby")                # what it did last night
    cert_expiry = Column(Date, nullable=False)                # fitness certificate
    km_since_overhaul = Column(Float, default=0)
    total_km = Column(Float, default=0)
    last_cleaned = Column(Date)
    branding_partner = Column(String)
    branding_priority = Column(String, default="none")        # high / medium / none
    risk = Column(Float, default=0.3)                         # 0..1 chance of fault within 7 days
    risk_factors = Column(Text, default="[]")                 # JSON, why the risk is what it is

    job_cards = relationship("JobCard", back_populates="train", cascade="all, delete-orphan")

    # --- small helpers so other code stays readable ---
    @property
    def cert_days_left(self) -> int:
        return (self.cert_expiry - date.today()).days

    @property
    def cleaning_due(self) -> bool:
        from .config import CLEANING_CYCLE_DAYS
        return self.last_cleaned is None or (date.today() - self.last_cleaned).days >= CLEANING_CYCLE_DAYS

    @property
    def open_cards(self):
        return [c for c in self.job_cards if c.status == "open"]

    @property
    def serious_cards(self):
        return [c for c in self.open_cards if c.severity == "high"]

    @property
    def factors(self):
        return json.loads(self.risk_factors or "[]")


class JobCard(Base):
    """A reported fault. 'high' severity blocks the train from passenger service."""
    __tablename__ = "job_cards"
    id = Column(Integer, primary_key=True)
    train_id = Column(Integer, ForeignKey("trains.id"), nullable=False)
    description = Column(String, nullable=False)
    severity = Column(String, nullable=False)                 # high / low
    status = Column(String, default="open")                   # open / closed
    opened = Column(Date, default=date.today)
    closed = Column(Date)
    train = relationship("Train", back_populates="job_cards")


class DailyLog(Base):
    """One row per train per past day. This is the training data for the risk model."""
    __tablename__ = "daily_logs"
    id = Column(Integer, primary_key=True)
    train_id = Column(Integer, ForeignKey("trains.id"), nullable=False)
    day = Column(Date, nullable=False)
    km_since_overhaul = Column(Float)
    cert_days_left = Column(Integer)
    open_cards = Column(Integer)
    open_serious = Column(Integer)
    fault_within_7_days = Column(Boolean)


class Plan(Base):
    """A nightly induction plan. Entries are stored as JSON so the table stays simple."""
    __tablename__ = "plans"
    id = Column(Integer, primary_key=True)
    plan_date = Column(Date, nullable=False)
    strategy = Column(String, nullable=False)
    status = Column(String, default="proposed")               # proposed / approved / rejected
    entries = Column(Text, nullable=False)                    # JSON list, one item per train
    summary = Column(Text, nullable=False)                    # JSON: counts, coverage, warnings
    notes = Column(Text)                                      # officer's comment
    decided_by = Column(String)
    decided_at = Column(DateTime)
    created_by = Column(String)
    created_at = Column(DateTime, default=datetime.now)


class AuditEvent(Base):
    """Append-only record of operational decisions and fleet changes."""
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True)
    occurred_at = Column(DateTime, nullable=False, default=datetime.now, index=True)
    actor = Column(String, nullable=False)
    action = Column(String, nullable=False, index=True)
    entity = Column(String, nullable=False)
    entity_id = Column(String)
    details = Column(Text, nullable=False, default="{}")


class ChangeLog(Base):
    """Change log table: who, what, old value, new value, timestamp."""
    __tablename__ = "change_logs"
    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.now, index=True)
    user = Column(String, nullable=False)
    entity_type = Column(String, nullable=False, index=True)  # train, timetable, station, depot_bay, constraint
    entity_id = Column(String, nullable=False)
    action = Column(String, nullable=False)                    # create, update, delete
    field_name = Column(String)                               # field that changed or 'all'
    old_value = Column(Text)                                  # JSON or str
    new_value = Column(Text)                                  # JSON or str


class ConstraintConfig(Base):
    """Scheduling constraints stored in DB."""
    __tablename__ = "constraint_configs"
    key = Column(String, primary_key=True)                    # e.g. min_service_trains, cleaning_slots_per_night
    name = Column(String, nullable=False)
    category = Column(String, default="general")              # fleet, safety, maintenance, depot, commercial
    description = Column(String)
    enabled = Column(Boolean, default=True)
    is_hard = Column(Boolean, default=True)                   # hard vs soft
    weight = Column(Float, default=1.0)                       # weight slider for soft (0.1 - 10.0)
    value_type = Column(String, default="int")                # int, float, str, json
    val_int = Column(Integer)
    val_float = Column(Float)
    val_str = Column(String)
    val_json = Column(Text)

    def get_value(self):
        if self.value_type == "int":
            return self.val_int
        elif self.value_type == "float":
            return self.val_float
        elif self.value_type == "json":
            return json.loads(self.val_json or "null")
        return self.val_str

    def set_value(self, val):
        if self.value_type == "int":
            self.val_int = int(val) if val is not None else None
        elif self.value_type == "float":
            self.val_float = float(val) if val is not None else None
        elif self.value_type == "json":
            self.val_json = json.dumps(val) if not isinstance(val, str) else val
        else:
            self.val_str = str(val) if val is not None else ""


class ConstraintPreset(Base):
    """Presets like Normal day, Festival rush, Monsoon, etc."""
    __tablename__ = "constraint_presets"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(String)
    config_json = Column(Text, nullable=False)                # JSON dict of key -> {enabled, is_hard, weight, value}
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)


class TimetableParam(Base):
    """Timetable parameters per line or system-wide."""
    __tablename__ = "timetable_params"
    id = Column(Integer, primary_key=True)
    line = Column(String, unique=True, nullable=False)         # line_1, line_2
    line_name = Column(String, nullable=False)
    first_train_time = Column(String, default="06:00")         # HH:MM
    last_train_time = Column(String, default="22:30")          # HH:MM
    peak_headway_min = Column(Integer, default=15)             # headway minutes
    off_peak_headway_min = Column(Integer, default=20)
    trips_per_train = Column(Integer, default=9)
    service_needed = Column(Integer, default=8)                # min trains needed in service
    corridor_km = Column(Float, default=19.65)


class Station(Base):
    """Metro stations."""
    __tablename__ = "stations"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, nullable=False)         # e.g. KHP, SIT, LOK
    name = Column(String, nullable=False)
    line = Column(String, nullable=False)                      # line_1, line_2, interchange
    order_in_line = Column(Integer, default=1)
    interchange = Column(Boolean, default=False)
    terminal = Column(Boolean, default=False)
    depot_attached = Column(String)                            # Depot name if attached


class DepotBay(Base):
    """Depots and stabling / maintenance bays."""
    __tablename__ = "depot_bays"
    id = Column(Integer, primary_key=True)
    depot = Column(String, nullable=False)                     # Milan Depot (Khapri), LON Depot (Lokmanya Nagar)
    bay_number = Column(String, nullable=False)                # e.g. S-01, S-02, M-01
    bay_type = Column(String, default="stabling")              # stabling, maintenance, wash_plant
    capacity = Column(Integer, default=2)                      # e.g. 2 trains per stabling track (front & rear)
    line = Column(String, nullable=False)                      # line_1 or line_2
    notes = Column(String)



def init_db():
    Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
