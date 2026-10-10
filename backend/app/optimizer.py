"""
The planner. It decides, for every train, one of:  service / maintenance / standby.

Step 1 - SAFETY RULES (never broken):
    a train with an expired certificate, a serious open fault, or an overhaul due
    can NOT carry passengers.
Step 2 - DEMAND: Trains needed on Line 1 and Line 2 (loaded from DB or defaults).
Step 3 - PREFERENCES (soft): pick low-risk, low-wear trains; keep advertising trains
    running; balance cleaning slots and shunting moves according to DB constraints.

Google OR-Tools CP-SAT finds the best answer that follows all the rules.
"""
import time
import math
from ortools.sat.python import cp_model

from . import config as C

STATUSES = ("service", "maintenance", "standby")


# ---------------------------------------------------------------------------
# 1. Turn database trains into plain dictionaries the solver can read
# ---------------------------------------------------------------------------
def build_rows(trains, constraints=None):
    c_map = constraints or {}
    overhaul_km = c_map.get("overhaul_km_limit", {}).get("value", C.OVERHAUL_KM)
    fitness_rule_enabled = c_map.get("fitness_cert_rule", {}).get("enabled", True)

    by_slot = {(t.depot, t.track, t.track_position): t.code for t in trains}
    rows = []
    for t in trains:
        blocks = []
        if fitness_rule_enabled and t.cert_days_left < 0:
            blocks.append(f"fitness certificate expired {-t.cert_days_left} days ago")
        if t.serious_cards:
            blocks.append("serious fault open: " + t.serious_cards[0].description.lower())
        if t.km_since_overhaul >= overhaul_km:
            blocks.append(f"overhaul due ({t.km_since_overhaul:,.0f} km)")
        rows.append({
            "code": t.code, "line": t.line, "risk": t.risk, "km": t.km_since_overhaul,
            "depot": t.depot,
            "cert_days": t.cert_days_left, "open_cards": len(t.open_cards),
            "cleaning_due": t.cleaning_due, "partner": t.branding_partner,
            "priority": t.branding_priority, "current": t.status,
            "blocks": blocks, "blocked": bool(blocks),
            # the train parked in front of this one (it must move first)
            "front": by_slot.get((t.depot, t.track, 1)) if t.track_position == 2 else None,
        })
    return rows


def check_overrides(rows, overrides, max_bays_by_depot=None):
    """Officer wishes {code: status}. Returns (accepted, refused)."""
    depot_limits = max_bays_by_depot if max_bays_by_depot is not None else C.MAINTENANCE_BAYS_BY_DEPOT
    known = {r["code"]: r for r in rows}
    accepted, refused = {}, []
    for code, status in (overrides or {}).items():
        r = known.get(code)
        if not r or status not in STATUSES:
            continue
        if status == "service" and r["blocked"]:
            refused.append({"code": code, "reason": f"{code} cannot run passengers: " + "; ".join(r["blocks"]) + "."})
        else:
            accepted[code] = status
    # Manual maintenance selections obey physical bay limits
    by_depot = {}
    for code, status in list(accepted.items()):
        if status != "maintenance":
            continue
        depot = known[code].get("depot")
        capacity = depot_limits.get(depot, 3)
        by_depot[depot] = by_depot.get(depot, 0) + 1
        if by_depot[depot] > capacity:
            del accepted[code]
            by_depot[depot] -= 1
            refused.append({"code": code, "reason": f"{code} maintenance request refused: {depot or 'unknown depot'} has reached its {capacity}-bay capacity."})
    return accepted, refused


# ---------------------------------------------------------------------------
# 2. Diagnose infeasibility in plain language
# ---------------------------------------------------------------------------
def diagnose_infeasibility(rows, constraints, pins):
    """When CP-SAT status is INFEASIBLE, analyze why in plain language."""
    reasons = []
    n = len(rows)
    s1_need = constraints.get("min_service_l1", {}).get("value", C.SERVICE_NEEDED["line_1"])
    s2_need = constraints.get("min_service_l2", {}).get("value", C.SERVICE_NEEDED["line_2"])
    total_needed = s1_need + s2_need

    # Check unblocked trains
    available_service = [r for r in rows if not r["blocked"]]
    if len(available_service) < total_needed:
        reasons.append(
            f"Fleet shortage: Only {len(available_service)} trains are safe for passenger service "
            f"(due to certificate/fault/overhaul rules), but timetable requires {total_needed} ({s1_need} Line 1 + {s2_need} Line 2)."
        )

    # Check pinned overrides conflicting with safety or capacity
    forced_maint = sum(1 for c, s in pins.items() if s == "maintenance")
    max_bays = constraints.get("max_maintenance_bays", {}).get("value", C.MAINTENANCE_BAYS)
    if forced_maint > max_bays:
        reasons.append(
            f"Maintenance bay overflow: {forced_maint} trains were forced to maintenance, exceeding the limit of {max_bays}."
        )

    forced_standby = sum(1 for c, s in pins.items() if s == "standby")
    max_standby_cfg = constraints.get("max_standby", {})
    if max_standby_cfg.get("enabled") and max_standby_cfg.get("is_hard"):
        max_standby_val = max_standby_cfg.get("value", 7)
        if (n - total_needed) > max_standby_val:
            reasons.append(
                f"Standby constraint conflict: Hard max standby limit is {max_standby_val}, but with {total_needed} in service, {n - total_needed} trains would remain."
            )

    if not reasons:
        reasons.append(
            "Conflicting constraints: The combination of service demand, manual overrides, "
            "and depot maintenance capacities cannot be simultaneously satisfied."
        )
    return reasons


# ---------------------------------------------------------------------------
# 3. Solve with DB-driven constraints
# ---------------------------------------------------------------------------
def solve(rows, strategy=C.DEFAULT_STRATEGY, overrides=None, constraints=None, timetable=None):
    started = time.time()
    w = C.STRATEGIES.get(strategy, C.STRATEGIES[C.DEFAULT_STRATEGY])["weights"]
    c_map = constraints or {}

    # Extract constraint values
    s1_cfg = c_map.get("min_service_l1", {})
    s2_cfg = c_map.get("min_service_l2", {})
    s1_need = s1_cfg.get("value", timetable.get("line_1", {}).get("service_needed", C.SERVICE_NEEDED["line_1"]) if timetable else C.SERVICE_NEEDED["line_1"])
    s2_need = s2_cfg.get("value", timetable.get("line_2", {}).get("service_needed", C.SERVICE_NEEDED["line_2"]) if timetable else C.SERVICE_NEEDED["line_2"])

    max_bays_cfg = c_map.get("max_maintenance_bays", {})
    max_bays = max_bays_cfg.get("value", C.MAINTENANCE_BAYS)

    khapri_bays = c_map.get("khapri_maint_bays", {}).get("value", C.MAINTENANCE_BAYS_BY_DEPOT.get(C.DEPOTS["line_1"], 3))
    lon_bays = c_map.get("lon_maint_bays", {}).get("value", C.MAINTENANCE_BAYS_BY_DEPOT.get(C.DEPOTS["line_2"], 3))
    depot_bay_limits = {
        C.DEPOTS["line_1"]: khapri_bays,
        C.DEPOTS["line_2"]: lon_bays,
    }

    max_standby_cfg = c_map.get("max_standby", {})
    branding_weight_cfg = c_map.get("branding_exposure_weight", {})
    cleaning_slots_cfg = c_map.get("cleaning_slots_per_night", {})
    mileage_tol_cfg = c_map.get("mileage_balance_tolerance", {})

    pins, refused = check_overrides(rows, overrides, depot_bay_limits)
    n = len(rows)
    m = cp_model.CpModel()

    x = {(i, s): m.NewBoolVar(f"x{i}{s}") for i in range(n) for s in STATUSES}
    for i in range(n):
        m.AddExactlyOne(x[i, s] for s in STATUSES)

    # Safety: blocked trains never carry passengers
    for i, r in enumerate(rows):
        if r["blocked"]:
            m.Add(x[i, "service"] == 0)

    # Officer's manual choices
    idx = {r["code"]: i for i, r in enumerate(rows)}
    for code, status in pins.items():
        m.Add(x[idx[code], status] == 1)

    # Spares allocation to cover line 1 or line 2
    spares = [i for i, r in enumerate(rows) if r["line"] == "spare"]
    y = {i: m.NewBoolVar(f"y{i}") for i in spares}
    for i in spares:
        m.Add(y[i] <= x[i, "service"])
    on_l1 = sum(x[i, "service"] for i, r in enumerate(rows) if r["line"] == "line_1") + sum(y.values())
    on_l2 = (sum(x[i, "service"] for i, r in enumerate(rows) if r["line"] == "line_2")
             + sum(x[i, "service"] - y[i] for i in spares))

    # Demand: each line needs its trains; spares (y=1) cover line 1, (y=0) cover line 2
    short1 = m.NewIntVar(0, max(s1_need, 1), "short1")
    short2 = m.NewIntVar(0, max(s2_need, 1), "short2")
    m.Add(short1 >= s1_need - on_l1)
    m.Add(short2 >= s2_need - on_l2)

    # If user enabled hard constraint for min_service, enforce strictly on_l1 >= s1_need
    if s1_cfg.get("enabled", False) and s1_cfg.get("is_hard", False):
        m.Add(on_l1 >= s1_need)
    if s2_cfg.get("enabled", False) and s2_cfg.get("is_hard", False):
        m.Add(on_l2 >= s2_need)
    m.Add(on_l1 + on_l2 <= s1_need + s2_need)       # never run extra trains



    # Maintenance bays
    if max_bays_cfg.get("enabled", True):
        if max_bays_cfg.get("is_hard", True):
            m.Add(sum(x[i, "maintenance"] for i in range(n)) <= max_bays)

    for depot, limit in depot_bay_limits.items():
        depot_rows = [i for i, r in enumerate(rows) if r.get("depot") == depot]
        m.Add(sum(x[i, "maintenance"] for i in depot_rows) <= limit)

    # Max standby constraint
    standby_excess = None
    if max_standby_cfg.get("enabled", False):
        max_standby_val = max_standby_cfg.get("value", 7)
        if max_standby_cfg.get("is_hard", False):
            m.Add(sum(x[i, "standby"] for i in range(n)) <= max_standby_val)
        else:
            standby_excess = m.NewIntVar(0, n, "standby_excess")
            m.Add(standby_excess >= sum(x[i, "standby"] for i in range(n)) - max_standby_val)

    # Shunting moves: parked behind another train
    shunts = []
    for i, r in enumerate(rows):
        if r["front"] in idx:
            j = idx[r["front"]]
            s = m.NewBoolVar(f"shunt{i}")
            m.Add(s >= x[i, "service"] - x[j, "service"])
            shunts.append(s)

    # Objective calculation
    cost = 100_000 * (short1 + short2)

    # Soft weights
    branding_mult = branding_weight_cfg.get("value", 1.0) if branding_weight_cfg.get("enabled", True) else 0.0
    soft_branding_weight = branding_weight_cfg.get("weight", 1.0)

    wear_scale = int(mileage_tol_cfg.get("value", 50)) if mileage_tol_cfg.get("enabled", True) else 50
    wear_weight = mileage_tol_cfg.get("weight", 1.0) * w.get("wear", 1)

    cleaning_slots = int(cleaning_slots_cfg.get("value", 4)) if cleaning_slots_cfg.get("enabled", True) else 4
    cleaning_weight = cleaning_slots_cfg.get("weight", 1.0)

    for i, r in enumerate(rows):
        svc, mnt = x[i, "service"], x[i, "maintenance"]
        cost += w["risk"] * int(r["risk"] * 1000) * svc
        cost += int(wear_weight * int(r["km"] // max(wear_scale, 10))) * svc

        # Branding bonus
        base_brand_bonus = {"high": 800, "medium": 400}.get(r["priority"], 0)
        brand_bonus = int(base_brand_bonus * branding_mult * soft_branding_weight)
        cost -= brand_bonus * svc

        # Cleaning penalty for running dirty trains
        if r["cleaning_due"]:
            cost += int(500 * cleaning_weight) * svc

        need_maint = 300 * min(r["open_cards"], 3) + (1500 if r["blocked"] else 0)
        cost -= need_maint * mnt
        cost += 50 * mnt

        if w.get("change") and r["current"] in STATUSES:
            cost += 500 * w["change"] * (1 - x[i, r["current"]])

    if shunts:
        cost += 350 * sum(shunts)
    if standby_excess is not None:
        cost += int(2000 * max_standby_cfg.get("weight", 1.0)) * standby_excess

    m.Minimize(cost)


    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5
    solver.parameters.random_seed = 42
    status = solver.Solve(m)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        diagnostics = diagnose_infeasibility(rows, c_map, pins)
        diag_msg = " | ".join(diagnostics)
        raise RuntimeError(f"Constraint Conflict (Infeasible): {diag_msg}")

    # Read results
    entries = []
    for i, r in enumerate(rows):
        assigned = next(s for s in STATUSES if solver.Value(x[i, s]))
        serves = None
        if assigned == "service":
            serves = r["line"] if r["line"] != "spare" else ("line_1" if solver.Value(y[i]) else "line_2")
        entries.append({
            "code": r["code"], "line": r["line"], "assignment": assigned, "serves": serves,
            "risk": r["risk"], "risk_level": C.risk_level(r["risk"]), "forced": r["code"] in pins,
            "reason": _reason(r, assigned, serves, r["code"] in pins),
        })

    cover = {
        "line_1": sum(1 for e in entries if e["serves"] == "line_1"),
        "line_2": sum(1 for e in entries if e["serves"] == "line_2"),
    }
    warnings = [f"{C.LINE_NAMES[l]} is short of trains: {cover[l]} of {s1_need if l == 'line_1' else s2_need} available."
                for l in cover if cover[l] < (s1_need if l == 'line_1' else s2_need)]
    warnings += [d["reason"] for d in refused]

    # Calculate mileage variance across active trains
    service_kms = [r["km"] for e, r in zip(entries, rows) if e["assignment"] == "service"]
    if service_kms:
        mean_km = sum(service_kms) / len(service_kms)
        mileage_variance = sum((k - mean_km) ** 2 for k in service_kms) / len(service_kms)
        mileage_std = math.sqrt(mileage_variance)
    else:
        mileage_variance = 0.0
        mileage_std = 0.0

    # Constraint violations / near-violations summary
    violations = []
    if cover["line_1"] < s1_need:
        violations.append(f"Line 1 shortfall: {cover['line_1']} / {s1_need} trains in service")
    if cover["line_2"] < s2_need:
        violations.append(f"Line 2 shortfall: {cover['line_2']} / {s2_need} trains in service")
    maint_count = sum(1 for e in entries if e["assignment"] == "maintenance")
    if maint_count > max_bays:
        violations.append(f"Maintenance capacity exceeded: {maint_count} / {max_bays}")
    standby_count = sum(1 for e in entries if e["assignment"] == "standby")
    max_sb_val = max_standby_cfg.get("value", 7)
    if max_standby_cfg.get("enabled") and standby_count > max_sb_val:
        violations.append(f"Standby fleet exceeded target: {standby_count} > {max_sb_val}")

    return {
        "strategy": strategy,
        "entries": entries,
        "summary": {
            "counts": {s: sum(1 for e in entries if e["assignment"] == s) for s in STATUSES},
            "coverage": {
                "line_1": {"have": cover["line_1"], "need": s1_need},
                "line_2": {"have": cover["line_2"], "need": s2_need},
            },
            "kpis": {
                "trains_in_service": cover["line_1"] + cover["line_2"],
                "trains_standby": standby_count,
                "trains_maintenance": maint_count,
                "mileage_variance": round(mileage_variance, 1),
                "mileage_std_km": round(mileage_std, 1),
                "constraint_violations": violations,
            },
            "warnings": warnings,
            "solve_ms": round((time.time() - started) * 1000),
            "optimal": status == cp_model.OPTIMAL,
        },
    }


def _reason(r, assigned, serves, forced):
    risk = f"{round(r['risk'] * 100)}% risk"
    if assigned == "service":
        parts = [f"Certificate valid {r['cert_days']} days", risk]
        if r["partner"]:
            parts.append(f"carries {r['partner']} advertising")
        if r["line"] == "spare":
            parts.append(f"spare covering {C.LINE_NAMES.get(serves, serves)}")
        text = "Cleared for service: " + ", ".join(parts) + "."
    elif assigned == "maintenance":
        why = list(r["blocks"])
        if not why and r["open_cards"]:
            why.append(f"{r['open_cards']} open fault report{'s' if r['open_cards'] != 1 else ''}")
        if not why and r["cleaning_due"]:
            why.append("cleaning is due")
        if not why:
            why.append("routine inspection")
        text = "Sent to maintenance: " + "; ".join(why) + "."
    else:
        text = f"On standby as a spare ({risk}); not needed for service tonight."
        if r["risk"] >= C.RISK_HIGH:
            text = f"Kept on standby: high breakdown risk ({round(r['risk'] * 100)}%)."
        if r["blocked"]:
            text = "On standby: " + "; ".join(r["blocks"]) + "."
    return ("Set by officer. " if forced else "") + text


def diff(old_entries, new_entries):
    """What changed between two plans (used by the What-If preview)."""
    before = {e["code"]: e["assignment"] for e in old_entries}
    return [{"code": e["code"], "from": before.get(e["code"]), "to": e["assignment"]}
            for e in new_entries if before.get(e["code"]) != e["assignment"]]
