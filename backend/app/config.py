"""
All the numbers and rules of the project live here, in one place.
Change a value here and the whole system follows.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("METRO_DB", BASE_DIR / "data" / "metro.db"))
APP_ENV = os.environ.get("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production" or os.environ.get("RENDER", "").lower() == "true"


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized not in {"1", "true", "yes", "on", "0", "false", "no", "off"}:
        raise RuntimeError(f"{name} must be true or false.")
    return normalized in {"1", "true", "yes", "on"}


import logging as _logging
_LOCAL_SECRET = "metro-local-development-secret-32bytes"
SECRET = os.environ.get("METRO_SECRET", _LOCAL_SECRET)
if IS_PRODUCTION and (len(SECRET) < 32 or SECRET == _LOCAL_SECRET):
    raise RuntimeError("Production requires a private METRO_SECRET with at least 32 characters.")
if SECRET == _LOCAL_SECRET:
    _logging.warning(
        "[metro] Using the built-in development SECRET. JWT tokens are not secure. "
        "Set METRO_SECRET in your environment before any real deployment."
    )

SIMULATION_MODE = _env_bool("METRO_DEMO_MODE", not IS_PRODUCTION)
ADMIN_USERNAME = os.environ.get("METRO_ADMIN_USERNAME", "").strip().lower()
ADMIN_PASSWORD = os.environ.get("METRO_ADMIN_PASSWORD", "")
ADMIN_NAME = os.environ.get("METRO_ADMIN_NAME", "Depot Administrator").strip() or "Depot Administrator"
if IS_PRODUCTION:
    if not ADMIN_USERNAME or not ADMIN_PASSWORD:
        raise RuntimeError("Production requires METRO_ADMIN_USERNAME and METRO_ADMIN_PASSWORD.")
    if ADMIN_USERNAME in {"officer", "viewer"}:
        raise RuntimeError("Production administrator username must not use a built-in demo username.")
    if len(ADMIN_PASSWORD) < 14:
        raise RuntimeError("Production METRO_ADMIN_PASSWORD must be at least 14 characters.")

TOKEN_HOURS = 12
SOLVER_TIMEOUT_SECONDS = 5  # moved from optimizer.py; change here to tune

# ---- Fleet (Nagpur Metro, from the official timetable) -------------------
FLEET_SIZE = 23
SERVICE_NEEDED = {"line_1": 8, "line_2": 8}     # trains running each line
MAINTENANCE_BAYS = 6                            # 3 at each depot
DEPOTS = {"line_1": "Milan Depot (Khapri)", "line_2": "LON Depot (Lokmanya Nagar)"}
MAINTENANCE_BAYS_BY_DEPOT = {
    DEPOTS["line_1"]: 3,
    DEPOTS["line_2"]: 3,
}
LINE_NAMES = {"line_1": "Line 1 (Orange)", "line_2": "Line 2 (Aqua)", "spare": "Spare"}
# km a train runs per day = corridor length x 2 x ~4.4 round trips (from timetable)
DAILY_KM = {"line_1": 169.3, "line_2": 167.5}

# ---- Safety & maintenance rules ------------------------------------------
OVERHAUL_KM = 25_000        # must go to maintenance at this mileage
OVERHAUL_WARN_KM = 22_500   # start warning here
CERT_CYCLE_DAYS = 90        # fitness certificate is renewed every 90 days
CERT_WARN_DAYS = 10
CLEANING_CYCLE_DAYS = 4

# ---- Risk levels (probability of a fault in the next 7 days) -------------
RISK_HIGH = 0.60
RISK_MEDIUM = 0.30


def risk_level(score: float) -> str:
    return "high" if score >= RISK_HIGH else "medium" if score >= RISK_MEDIUM else "low"

# ---- Advertising wraps on specific trains --------------------------------
BRANDING = {
    "NMR-01": ("SBI Yono", "high"),
    "NMR-04": ("Mahindra Auto", "high"),
    "NMR-07": ("Amul Dairy", "medium"),
    "NMR-10": ("Tata Motors EV", "high"),
    "NMR-15": ("Life Insurance Corp (LIC)", "medium"),
    "NMR-18": ("Nagpur Tourism", "medium"),
    "NMR-22": ("Air India Express", "high"),
}

# ---- The three ways the planner can choose trains ------------------------
STRATEGIES = {
    "safest": {
        "label": "Safest",
        "description": "Sends the trains least likely to break down.",
        "weights": {"risk": 3, "wear": 1, "change": 0},
    },
    "even_wear": {
        "label": "Even wear",
        "description": "Spreads kilometres evenly so no train wears out early.",
        "weights": {"risk": 1, "wear": 3, "change": 0},
    },
    "least_change": {
        "label": "Least change",
        "description": "Keeps trains doing what they did yesterday, unless safety says otherwise.",
        "weights": {"risk": 1, "wear": 1, "change": 1},
    },
}
DEFAULT_STRATEGY = "safest"

# ---- Demo logins (created on first run) ----------------------------------
DEMO_USERS = [] if IS_PRODUCTION else [
    {"username": "officer", "password": "officer123", "name": "Vikram Deshmukh", "role": "officer"},
    {"username": "viewer", "password": "viewer123", "name": "Guest Viewer", "role": "viewer"},
]
