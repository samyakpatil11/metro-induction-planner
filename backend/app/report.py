"""Printable PDF of tonight's plan, for the night shift."""
import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from . import config as C

ORANGE = colors.HexColor("#EA580C")
GROUPS = [("service", "Running passenger service"), ("maintenance", "In maintenance"), ("standby", "On standby")]


def build_pdf(plan, alerts) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    st = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=st["Title"], textColor=ORANGE, fontSize=20, alignment=0)
    h2 = ParagraphStyle("h2", parent=st["Heading2"], fontSize=12, spaceBefore=12, textColor=colors.HexColor("#1E293B"))
    small = ParagraphStyle("s", parent=st["BodyText"], fontSize=8.5, leading=11)

    status = {"approved": "APPROVED", "rejected": "REJECTED", "proposed": "NOT YET APPROVED"}[plan["status"]]
    s = [Paragraph("Nagpur Metro - Induction Plan", h1),
         Paragraph(f"For the night of <b>{plan['plan_date']:%d %B %Y}</b> &nbsp;|&nbsp; Status: <b>{status}</b> "
                   f"&nbsp;|&nbsp; Priority: {C.STRATEGIES[plan['strategy']]['label']}", st["BodyText"])]
    if plan.get("decided_by"):
        s.append(Paragraph(f"Decided by {plan['decided_by']} on {plan['decided_at']:%d %b %Y, %H:%M}."
                           + (f" Note: {plan['notes']}" if plan.get("notes") else ""), small))

    c = plan["summary"]["counts"]; cov = plan["summary"]["coverage"]
    s.append(Paragraph(f"In service: <b>{c['service']}</b> (Line 1: {cov['line_1']['have']}/{cov['line_1']['need']}, "
                       f"Line 2: {cov['line_2']['have']}/{cov['line_2']['need']}) &nbsp; Maintenance: <b>{c['maintenance']}</b> "
                       f"&nbsp; Standby: <b>{c['standby']}</b>", st["BodyText"]))

    for key, title in GROUPS:
        rows = [e for e in plan["entries"] if e["assignment"] == key]
        if not rows:
            continue
        s.append(Paragraph(f"{title} ({len(rows)})", h2))
        data = [["Train", "Line", "Risk", "Reason"]]
        for e in rows:
            line = C.LINE_NAMES[e["serves"] or e["line"]].split(" (")[0]
            data.append([e["code"], line, f"{round(e['risk'] * 100)}%", Paragraph(e["reason"], small)])
        t = Table(data, colWidths=[55, 50, 40, 390], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), ORANGE), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FFF7ED")]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
        ]))
        s.append(t)

    important = [a for a in alerts if a["level"] != "info"]
    if important:
        s.append(Paragraph("Open alerts", h2))
        for a in important:
            s.append(Paragraph(f"&bull; <b>{a['train'] or 'Plan'}</b> - {a['title']}: {a['detail']}", small))

    s += [Spacer(1, 30), Paragraph("Officer signature: ______________________ &nbsp;&nbsp; Date: ____________", st["BodyText"]),
          Spacer(1, 6), Paragraph(f"Generated {datetime.now():%d %b %Y %H:%M} by the Metro Induction Planner.", small)]
    doc.build(s)
    return buf.getvalue()
