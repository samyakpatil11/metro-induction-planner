"""
Creates realistic *demo* data the first time the app runs.
Replace this file's output with real depot data when you have it.
"""
import math
import random
from datetime import date, timedelta

from . import config as C
from .auth import hash_password
from .db import (
    User, Train, JobCard, DailyLog,
    ConstraintConfig, ConstraintPreset, TimetableParam, Station, DepotBay
)

HISTORY_DAYS = 150
FAULTS = [("Brake wear", "high"), ("Motor overheating", "high"), ("Wheel flat spot", "high"),
          ("Door sensor fault", "low"), ("Air-conditioning fault", "low"), ("Interior light fault", "low")]


def _true_fault_chance(km, cert_days, cards, serious):
    """Calibrated mechanical wear hazard function reflecting transit maintenance physics."""
    km_ratio = km / C.OVERHAUL_KM
    serious_flag = 1.0 if serious > 0 else 0.0
    cert_urgent = 1.0 if cert_days < 10 else 0.0
    logit = -4.8 + 7.5 * km_ratio + 4.5 * serious_flag + 1.3 * cards + 3.8 * cert_urgent
    return 1 / (1 + math.exp(-logit))


def seed_users(db, users=None):
    """Create local demo accounts, or a selected list of accounts for setup tools."""
    for user in C.DEMO_USERS if users is None else users:
        db.add(User(username=user["username"], name=user["name"], role=user["role"],
                    password_hash=hash_password(user["password"])))


def seed(db, rng=None, include_demo_users=True):
    rng = rng or random.Random(42)
    today = date.today()

    if include_demo_users and C.DEMO_USERS:
        seed_users(db)

    lines = ["line_1"] * 8 + ["line_2"] * 8 + ["spare"] * (C.FLEET_SIZE - 16)
    rng.shuffle(lines)
    slot = {"line_1": 0, "line_2": 0}
    trains = []
    for i in range(1, C.FLEET_SIZE + 1):
        code = f"NMR-{i:02d}"
        line = lines[i - 1]
        depot_line = line if line != "spare" else "line_1"
        n = slot[depot_line]; slot[depot_line] += 1

        # a few trains are deliberately "problem trains" so the demo shows the rules working
        if i in (1, 20):   cert_left = -rng.randint(1, 8)          # certificate expired
        else:              cert_left = rng.randint(8, 80)
        if i == 14:        km = 25_800.0                            # overhaul due
        elif i == 17:      km = 23_400.0                            # nearly due
        else:              km = round(rng.uniform(1_500, 17_000), 1)

        partner, priority = C.BRANDING.get(code, (None, "none"))
        t = Train(
            code=code, line=line, depot=C.DEPOTS[depot_line],
            track=f"S-{n // 2 % 6 + 1:02d}", track_position=1 if n % 2 == 0 else 2,
            status="standby" if line == "spare" else "service",
            cert_expiry=today + timedelta(days=cert_left),
            km_since_overhaul=km, total_km=round(km + rng.uniform(20_000, 200_000), 1),
            last_cleaned=today - timedelta(days=rng.randint(0, 7)),
            branding_partner=partner, branding_priority=priority,
        )
        db.add(t)
        trains.append(t)
    db.flush()

    # fault reports: two trains have a serious open fault, the rest have a few minor ones
    for i, t in enumerate(trains, start=1):
        if i in (2, 7):
            desc = rng.choice([f for f in FAULTS if f[1] == "high"])[0]
            db.add(JobCard(train_id=t.id, description=desc, severity="high", opened=today - timedelta(days=2)))
        for _ in range(rng.choice([0, 0, 1, 2])):
            desc = rng.choice([f for f in FAULTS if f[1] == "low"])[0]
            still_open = rng.random() < 0.4
            opened = today - timedelta(days=rng.randint(3, 40))
            db.add(JobCard(train_id=t.id, description=desc, severity="low",
                           status="open" if still_open else "closed", opened=opened,
                           closed=None if still_open else opened + timedelta(days=rng.randint(1, 10))))
    db.flush()

    # history: walk backwards from today, one row per train per day
    for t in trains:
        daily = C.DAILY_KM["line_1" if t.line == "spare" else t.line] * (0.3 if t.line == "spare" else 1)
        for ago in range(1, HISTORY_DAYS + 1):
            km = (t.km_since_overhaul - daily * ago) % C.OVERHAUL_KM
            cert = (t.cert_expiry - (today - timedelta(days=ago))).days % C.CERT_CYCLE_DAYS
            serious = 1 if rng.random() < 0.06 else 0
            cards = serious + rng.choice([0, 0, 1, 2])
            fault = rng.random() < _true_fault_chance(km, cert, cards, serious)
            db.add(DailyLog(train_id=t.id, day=today - timedelta(days=ago), km_since_overhaul=km,
                            cert_days_left=cert, open_cards=cards, open_serious=serious,
                            fault_within_7_days=fault))
    db.commit()


def seed_metadata(db):
    """Seed default constraints, presets, timetable parameters, stations, and depot bays."""
    # 1. Timetable Params
    if db.query(TimetableParam).count() == 0:
        db.add(TimetableParam(
            line="line_1", line_name="Line 1 (Orange)", first_train_time="06:00", last_train_time="22:30",
            peak_headway_min=15, off_peak_headway_min=20, trips_per_train=9, service_needed=8, corridor_km=19.65
        ))
        db.add(TimetableParam(
            line="line_2", line_name="Line 2 (Aqua)", first_train_time="06:15", last_train_time="22:15",
            peak_headway_min=15, off_peak_headway_min=20, trips_per_train=9, service_needed=8, corridor_km=18.55
        ))

    # 2. Stations (Nagpur Metro Line 1 & Line 2)
    if db.query(Station).count() == 0:
        line1_stations = [
            ("KHP", "Khapri", 1, True, False, "Milan Depot (Khapri)"),
            ("NEW", "New Airport", 2, False, False, None),
            ("APT", "Airport", 3, False, False, None),
            ("UJJ", "Ujjwal Nagar", 4, False, False, None),
            ("JAI", "Jaiprakash Nagar", 5, False, False, None),
            ("CST", "Chhatrapati Square", 6, False, False, None),
            ("AJN", "Ajni Square", 7, False, False, None),
            ("RAH", "Rahate Colony", 8, False, False, None),
            ("CON", "Congress Nagar", 9, False, False, None),
            ("SIT", "Sitabuldi Interchange", 10, False, True, None),
            ("ZER", "Zero Mile Freedom Park", 11, False, False, None),
            ("KST", "Kasturchand Park", 12, False, False, None),
            ("GAD", "GaddiGodam Square", 13, False, False, None),
            ("KAD", "Kadvibi Chowk", 14, False, False, None),
            ("IND", "Indora Square", 15, False, False, None),
            ("NAR", "Nari Road", 16, False, False, None),
            ("AUT", "Automotive Square", 17, True, False, None),
        ]
        for code, name, ord_idx, term, inter, depot in line1_stations:
            db.add(Station(code=code, name=name, line="line_1", order_in_line=ord_idx,
                           terminal=term, interchange=inter, depot_attached=depot))

        line2_stations = [
            ("LOK", "Lokmanya Nagar", 1, True, False, "LON Depot (Lokmanya Nagar)"),
            ("BSI", "Bansi Nagar", 2, False, False, None),
            ("VAS", "Vasudev Nagar", 3, False, False, None),
            ("RAC", "Rachana Ring Road", 4, False, False, None),
            ("SUB", "Subhash Nagar", 5, False, False, None),
            ("DHA", "Dharampeth College", 6, False, False, None),
            ("LAD", "LAD Chowk", 7, False, False, None),
            ("SHN", "Shankar Nagar Square", 8, False, False, None),
            ("INS", "Institute of Engineers", 9, False, False, None),
            ("JHS", "Jhansi Rani Square", 10, False, False, None),
            ("SIT2", "Sitabuldi (Aqua Platform)", 11, False, True, None),
            ("NGP", "Nagpur Railway Station", 12, False, False, None),
            ("DOS", "Dosar Vaisya Square", 13, False, False, None),
            ("AGR", "Agrasen Square", 14, False, False, None),
            ("CHI", "Chitar Oli Square", 15, False, False, None),
            ("TEL", "Telephone Exchange", 16, False, False, None),
            ("SHA", "Shanti Nagar", 17, False, False, None),
            ("ITW", "Itwari Dahi Bazaar", 18, False, False, None),
            ("PRA", "Prajapati Nagar", 19, True, False, None),
        ]
        for code, name, ord_idx, term, inter, depot in line2_stations:
            db.add(Station(code=code, name=name, line="line_2", order_in_line=ord_idx,
                           terminal=term, interchange=inter, depot_attached=depot))

    # 3. Depot Stabling and Maintenance Bays
    if db.query(DepotBay).count() == 0:
        # Milan Depot (Khapri) - Line 1
        for i in range(1, 7):
            db.add(DepotBay(depot="Milan Depot (Khapri)", bay_number=f"S-{i:02d}", bay_type="stabling", capacity=2, line="line_1", notes="Stabling track"))
        for i in range(1, 4):
            db.add(DepotBay(depot="Milan Depot (Khapri)", bay_number=f"M-{i:02d}", bay_type="maintenance", capacity=1, line="line_1", notes="IBL / Heavy Inspection Bay"))
        db.add(DepotBay(depot="Milan Depot (Khapri)", bay_number="W-01", bay_type="wash_plant", capacity=1, line="line_1", notes="Automatic train wash plant"))

        # LON Depot (Lokmanya Nagar) - Line 2
        for i in range(1, 7):
            db.add(DepotBay(depot="LON Depot (Lokmanya Nagar)", bay_number=f"S-{i:02d}", bay_type="stabling", capacity=2, line="line_2", notes="Stabling track"))
        for i in range(1, 4):
            db.add(DepotBay(depot="LON Depot (Lokmanya Nagar)", bay_number=f"M-{i:02d}", bay_type="maintenance", capacity=1, line="line_2", notes="Maintenance / Overhaul Bay"))
        db.add(DepotBay(depot="LON Depot (Lokmanya Nagar)", bay_number="W-01", bay_type="wash_plant", capacity=1, line="line_2", notes="Automatic train wash plant"))

    # 4. Constraints
    DEFAULT_CONSTRAINTS = [
        {"key": "min_service_l1", "name": "Min Trains in Service (Line 1)", "category": "fleet",
         "description": "Required active passenger trains on Line 1 (Orange).", "enabled": True, "is_hard": True, "weight": 5.0, "value_type": "int", "val_int": 8},
        {"key": "min_service_l2", "name": "Min Trains in Service (Line 2)", "category": "fleet",
         "description": "Required active passenger trains on Line 2 (Aqua).", "enabled": True, "is_hard": True, "weight": 5.0, "value_type": "int", "val_int": 8},
        {"key": "max_standby", "name": "Max Standby Spares Allowed", "category": "fleet",
         "description": "Cap on standby fleet buffer kept idle across depots.", "enabled": True, "is_hard": False, "weight": 2.0, "value_type": "int", "val_int": 7},
        {"key": "fitness_cert_rule", "name": "Fitness Certificate Expiry Rule", "category": "safety",
         "description": "Strictly bar any train with an expired fitness certificate from carrying passengers.", "enabled": True, "is_hard": True, "weight": 10.0, "value_type": "int", "val_int": 0},
        {"key": "overhaul_km_limit", "name": "Overhaul Mileage Limit (km)", "category": "safety",
         "description": "Trains exceeding this mileage since overhaul must be sent to maintenance.", "enabled": True, "is_hard": True, "weight": 10.0, "value_type": "int", "val_int": 25000},
        {"key": "mileage_balance_tolerance", "name": "Mileage Balancing Tolerance", "category": "maintenance",
         "description": "Penalize high km trains in soft objective to equalize wear.", "enabled": True, "is_hard": False, "weight": 3.0, "value_type": "int", "val_int": 50},
        {"key": "cleaning_slots_per_night", "name": "Cleaning Slots Per Night", "category": "maintenance",
         "description": "Maximum wash plant cleaning slots available per night fleetwide.", "enabled": True, "is_hard": False, "weight": 3.0, "value_type": "int", "val_int": 4},
        {"key": "max_maintenance_bays", "name": "Total Maintenance Bay Capacity", "category": "depot",
         "description": "Fleet-wide maximum simultaneous trains in maintenance bays.", "enabled": True, "is_hard": True, "weight": 10.0, "value_type": "int", "val_int": 6},
        {"key": "khapri_maint_bays", "name": "Milan Depot Maintenance Bays", "category": "depot",
         "description": "Physical maintenance bay limit at Milan Depot (Khapri).", "enabled": True, "is_hard": True, "weight": 10.0, "value_type": "int", "val_int": 3},
        {"key": "lon_maint_bays", "name": "LON Depot Maintenance Bays", "category": "depot",
         "description": "Physical maintenance bay limit at LON Depot (Lokmanya Nagar).", "enabled": True, "is_hard": True, "weight": 10.0, "value_type": "int", "val_int": 3},
        {"key": "branding_exposure_weight", "name": "Branding Commercial Exposure Weight", "category": "commercial",
         "description": "Preference weight to keep branded advertiser trains in revenue service.", "enabled": True, "is_hard": False, "weight": 4.0, "value_type": "float", "val_float": 1.0},
    ]

    for c in DEFAULT_CONSTRAINTS:
        existing = db.get(ConstraintConfig, c["key"])
        if not existing:
            db.add(ConstraintConfig(**c))

    # 5. Presets
    if db.query(ConstraintPreset).count() == 0:
        import json
        normal_preset = {c["key"]: {"enabled": c["enabled"], "is_hard": c["is_hard"], "weight": c["weight"], "value": c.get("val_int") or c.get("val_float") or c.get("val_str")} for c in DEFAULT_CONSTRAINTS}
        
        festival_preset = dict(normal_preset)
        festival_preset["min_service_l1"] = {**festival_preset["min_service_l1"], "value": 9}
        festival_preset["min_service_l2"] = {**festival_preset["min_service_l2"], "value": 9}
        festival_preset["max_standby"] = {**festival_preset["max_standby"], "value": 5}
        festival_preset["branding_exposure_weight"] = {**festival_preset["branding_exposure_weight"], "weight": 5.0, "value": 2.0}

        monsoon_preset = dict(normal_preset)
        monsoon_preset["min_service_l1"] = {**monsoon_preset["min_service_l1"], "value": 7}
        monsoon_preset["min_service_l2"] = {**monsoon_preset["min_service_l2"], "value": 7}
        monsoon_preset["cleaning_slots_per_night"] = {**monsoon_preset["cleaning_slots_per_night"], "value": 6, "weight": 4.0}
        monsoon_preset["mileage_balance_tolerance"] = {**monsoon_preset["mileage_balance_tolerance"], "weight": 4.0}

        db.add(ConstraintPreset(name="Normal day", description="Standard weekday timetable (8 trains per corridor, normal branding & cleaning).", config_json=json.dumps(normal_preset), is_default=True))
        db.add(ConstraintPreset(name="Festival rush", description="Peak capacity surge (9 trains/line, reduced standby, max commercial branding priority).", config_json=json.dumps(festival_preset), is_default=False))
        db.add(ConstraintPreset(name="Monsoon", description="Severe weather schedule with lower revenue load (7 trains/line) and higher cleaning & inspection priority.", config_json=json.dumps(monsoon_preset), is_default=False))

    db.commit()


def reset_to_synthetic(db):
    """Wipe current state and reseed original synthetic data and constraints."""
    from .db import Plan, ChangeLog, AuditEvent
    db.query(Plan).delete()
    db.query(DailyLog).delete()
    db.query(JobCard).delete()
    db.query(Train).delete()
    db.query(ChangeLog).delete()
    db.query(ConstraintConfig).delete()
    db.query(ConstraintPreset).delete()
    db.query(TimetableParam).delete()
    db.query(Station).delete()
    db.query(DepotBay).delete()
    db.commit()

    seed(db, include_demo_users=False)
    seed_metadata(db)
    from . import risk
    risk.train_model(db)
    risk.score_fleet(db)

