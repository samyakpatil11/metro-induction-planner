"""Things a depot officer should look at. Built fresh each time from live data."""
from . import config as C


def build_alerts(trains, plan):
    alerts = []

    def add(level, code, title, detail):
        alerts.append({"level": level, "train": code, "title": title, "detail": detail})

    for t in trains:
        if t.cert_days_left < 0:
            add("critical", t.code, "Certificate expired", f"Expired {-t.cert_days_left} days ago. Cannot carry passengers.")
        elif t.cert_days_left <= C.CERT_WARN_DAYS:
            add("warning", t.code, "Certificate expiring soon", f"Expires in {t.cert_days_left} days.")
        for c in t.serious_cards:
            add("critical", t.code, "Serious fault open", f"{c.description} (reported {c.opened:%d %b}).")
        if t.km_since_overhaul >= C.OVERHAUL_KM:
            add("critical", t.code, "Overhaul due", f"{t.km_since_overhaul:,.0f} km since last overhaul (limit {C.OVERHAUL_KM:,}).")
        elif t.km_since_overhaul >= C.OVERHAUL_WARN_KM:
            add("warning", t.code, "Overhaul coming up", f"{t.km_since_overhaul:,.0f} km since last overhaul (limit {C.OVERHAUL_KM:,}).")
        if t.risk >= C.RISK_HIGH and not t.serious_cards and t.km_since_overhaul < C.OVERHAUL_WARN_KM:
            add("warning", t.code, "High breakdown risk", f"{round(t.risk * 100)}% chance of a fault this week.")

    if plan:
        entries = {e["code"]: e for e in plan["entries"]}
        if plan["status"] == "proposed":
            add("info", None, "Plan waiting for approval", "Review tonight's plan and approve or reject it.")
        if plan["status"] == "approved":
            # safety net: something changed after the plan was approved
            for t in trains:
                e = entries.get(t.code)
                if e and e["assignment"] == "service" and (
                    t.serious_cards or t.cert_days_left < 0 or t.km_since_overhaul >= C.OVERHAUL_KM
                ):
                    add("critical", t.code, "Approved plan is now unsafe",
                        "This train is in service but now has a blocking fault, expired certificate, or overdue overhaul. Create a new plan.")
        for w in plan["summary"].get("warnings", []):
            add("warning", None, "Plan warning", w)
    else:
        add("info", None, "No plan yet", "Create tonight's plan on the Plan page.")

    order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: order[a["level"]])
    return alerts
