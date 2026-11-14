from collections import Counter
from datetime import datetime
from html import escape
from pathlib import Path

from openpyxl import Workbook
import pymupdf

OUTPUT = Path(__file__).resolve().parents[3] / "storage" / "reports"

EVENT_COLORS = {
    "TAB_SWITCH": "#f59e0b",
    "FULLSCREEN_EXIT": "#f97316",
    "FACE_NOT_VISIBLE": "#f43f5e",
    "EXCESSIVE_EYE_MOVEMENT": "#8b5cf6",
    "POSSIBLE_TALKING": "#0ea5e9",
    "MULTIPLE_FACES_DETECTED": "#d946ef",
    "VOICE_DETECTED": "#3b82f6",
    "BLACKLISTED_APP": "#ef4444",
    "USB_EVENT": "#06b6d4",
    "IDLE": "#64748b",
    "SCREEN_SHARE_STOPPED": "#b91c1c",
    "MULTIPLE_DISPLAYS": "#7c3aed",
}


def _label(value: str) -> str:
    return value.replace("_", " ").title()


def _date_time(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.strftime("%b %d, %Y · %I:%M:%S %p")
    except (TypeError, ValueError):
        return value


def _report_html(payload: dict, counts: Counter, score: dict) -> str:
    total = sum(counts.values())
    maximum = max(counts.values(), default=1)
    summary = "".join(
        f"<div class='metric'><div class='metric-row'><span class='dot' style='background:{EVENT_COLORS.get(kind, '#5850ec')}'></span>"
        f"<span>{escape(_label(kind))}</span><strong>{count}</strong></div>"
        f"<div class='bar'><i style='width:{max(count / maximum * 100, 5):.0f}%;background:{EVENT_COLORS.get(kind, '#5850ec')}'></i></div></div>"
        for kind, count in counts.most_common()
    ) or "<p class='muted'>No recorded monitoring events.</p>"
    timeline = "".join(
        f"<tr><td><span class='event-mark' style='background:{EVENT_COLORS.get(event['type'], '#5850ec')}'></span>{escape(_label(event['type']))}</td>"
        f"<td>{escape(_date_time(event['occurred_at']))}</td>"
        f"<td>{float(event.get('intensity') or 0) * 100:.0f}%</td></tr>"
        for event in payload["events"]
    ) or "<tr><td colspan='3' class='muted'>No activity was recorded.</td></tr>"
    tier = escape(str(score.get("tier", "Low")).title())
    score_value = int(score.get("score", 0))
    risk_color = "#dc2626" if tier.lower() == "high" else "#d97706" if tier.lower() == "medium" else "#059669"

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
@page {{ size:A4; margin:18mm 16mm 17mm; @bottom-right {{ content:'Page ' counter(page) ' of ' counter(pages); color:#8790a8; font-size:9px; }} }}
* {{ box-sizing:border-box }} body {{ margin:0; color:#172033; font:12px Arial,sans-serif; line-height:1.45 }}
.brand {{ color:#5850ec; font-size:11px; font-weight:800; letter-spacing:1.8px; text-transform:uppercase }}
h1 {{ margin:5px 0 3px; font-size:27px; letter-spacing:-.7px }} h2 {{ margin:25px 0 5px; font-size:16px }} .muted {{ color:#7b849c }}
.hero {{ border-bottom:3px solid #5850ec; padding:3px 0 17px }} .meta {{ margin-top:18px; display:flex; gap:10px }}
.meta-card {{ width:50%; padding:13px 15px; border:1px solid #e4e7ef; border-radius:9px; background:#f8f9fd }}
.meta-label {{ color:#8790a8; font-size:9px; font-weight:bold; letter-spacing:.8px; text-transform:uppercase }} .meta-value {{ margin-top:4px; font-weight:bold; font-size:13px }}
.stats {{ display:flex; gap:10px; margin-top:10px }} .stat {{ width:33.33%; border-radius:9px; padding:14px; color:white; background:#5850ec }}
.stat.score {{ background:{risk_color} }} .stat.dark {{ background:#242b3d }} .stat b {{ display:block; font-size:23px }} .stat span {{ font-size:9px; letter-spacing:.7px; text-transform:uppercase; opacity:.86 }}
.breakdown {{ border:1px solid #e4e7ef; border-radius:10px; padding:15px; margin-top:10px }} .metric {{ margin:0 0 13px }} .metric:last-child {{ margin-bottom:0 }}
.metric-row {{ display:flex; align-items:center; gap:7px; margin-bottom:5px }} .metric-row strong {{ margin-left:auto }} .dot,.event-mark {{ display:inline-block; width:8px; height:8px; border-radius:50% }}
.bar {{ height:6px; border-radius:4px; overflow:hidden; background:#edf0f6 }} .bar i {{ display:block; height:100%; border-radius:4px }}
table {{ width:100%; border-collapse:collapse; margin-top:10px }} thead {{ display:table-header-group }} tr {{ break-inside:avoid }}
th {{ background:#f1f3f9; color:#667089; font-size:9px; letter-spacing:.65px; text-align:left; text-transform:uppercase }} th,td {{ padding:9px 10px; border-bottom:1px solid #e5e8f0 }}
.event-mark {{ margin-right:8px }} footer {{ margin-top:22px; padding-top:10px; border-top:1px solid #e5e8f0; color:#8790a8; font-size:9px }}
</style></head><body>
<header class="hero"><div class="brand">ProctorX · Verified monitoring record</div><h1>Incident Report</h1><div class="muted">A consolidated review of all monitoring events from this exam session.</div></header>
<div class="meta"><div class="meta-card"><div class="meta-label">Student</div><div class="meta-value">{escape(payload['student'])}</div></div><div class="meta-card"><div class="meta-label">Exam</div><div class="meta-value">{escape(payload['exam'])}</div></div></div>
<div class="stats"><div class="stat"><b>{total}</b><span>Recorded events</span></div><div class="stat score"><b>{score_value}</b><span>Suspicion score · {tier}</span></div><div class="stat dark"><b>{len(counts)}</b><span>Signal categories</span></div></div>
<h2>Event breakdown</h2><div class="muted">Frequency of each monitoring signal</div><div class="breakdown">{summary}</div>
<h2>Activity timeline</h2><div class="muted">Complete event history shown in 12-hour time</div><table><thead><tr><th>Event</th><th>Date and time</th><th>Intensity</th></tr></thead><tbody>{timeline}</tbody></table>
<footer>Session reference: {escape(payload['session_id'])} · Generated by ProctorX</footer>
</body></html>"""


def _build_pdf(payload: dict, counts: Counter, score: dict, path: Path) -> None:
    """Create a polished PDF without platform-specific GTK dependencies."""
    document = pymupdf.open()
    page_size = pymupdf.paper_rect("a4")
    margin = 42
    navy = (0.09, 0.13, 0.23)
    purple = (0.35, 0.31, 0.93)
    muted = (0.46, 0.50, 0.60)
    border = (0.89, 0.90, 0.94)
    canvas = (0.97, 0.98, 0.99)
    total = sum(counts.values())
    tier = str(score.get("tier", "Low")).title()
    score_value = int(score.get("score", 0))
    risk = (0.86, 0.15, 0.15) if tier == "High" else (0.85, 0.47, 0.04) if tier == "Medium" else (0.02, 0.59, 0.41)

    def rgb(hex_color: str) -> tuple[float, float, float]:
        value = hex_color.lstrip("#")
        return tuple(int(value[index:index + 2], 16) / 255 for index in (0, 2, 4))

    def new_page(title: str | None = None):
        page = document.new_page(width=page_size.width, height=page_size.height)
        page.draw_rect(page.rect, color=(1, 1, 1), fill=(1, 1, 1))
        page.draw_rect(pymupdf.Rect(0, 0, page.rect.width, 8), color=purple, fill=purple)
        page.insert_text((margin, 31), "PROCTORX", fontsize=9, fontname="hebo", color=purple)
        if title:
            page.insert_text((margin, 56), title, fontsize=19, fontname="hebo", color=navy)
        page.insert_text((margin, page.rect.height - 24), f"Session reference: {payload['session_id']}", fontsize=7.5, color=muted)
        return page

    def card(page, rect, label: str, value: str, color=navy):
        page.draw_rect(rect, color=border, fill=canvas, width=0.8, radius=0.08)
        page.insert_text((rect.x0 + 13, rect.y0 + 18), label.upper(), fontsize=7, fontname="hebo", color=muted)
        page.insert_textbox(pymupdf.Rect(rect.x0 + 13, rect.y0 + 25, rect.x1 - 10, rect.y1 - 8), value, fontsize=13, fontname="hebo", color=color)

    page = new_page()
    page.insert_text((margin, 69), "Incident Report", fontsize=27, fontname="hebo", color=navy)
    page.insert_text((margin, 90), "Consolidated monitoring record for one exam session", fontsize=10, color=muted)
    page.draw_line((margin, 105), (page.rect.width - margin, 105), color=purple, width=2)
    card(page, pymupdf.Rect(margin, 122, 292, 184), "Student", str(payload["student"]))
    card(page, pymupdf.Rect(303, 122, page.rect.width - margin, 184), "Assessment", str(payload["exam"]))
    width = (page.rect.width - margin * 2 - 16) / 3
    card(page, pymupdf.Rect(margin, 200, margin + width, 266), "Recorded events", str(total), purple)
    card(page, pymupdf.Rect(margin + width + 8, 200, margin + width * 2 + 8, 266), "Suspicion score", f"{score_value} - {tier}", risk)
    card(page, pymupdf.Rect(margin + width * 2 + 16, 200, page.rect.width - margin, 266), "Signal categories", str(len(counts)), navy)
    page.insert_text((margin, 305), "Event breakdown", fontsize=15, fontname="hebo", color=navy)
    page.insert_text((margin, 321), "Frequency by monitoring signal", fontsize=8.5, color=muted)
    y = 348
    maximum = max(counts.values(), default=1)
    if not counts:
        page.insert_text((margin, y), "No monitoring events were recorded.", fontsize=10, color=muted)
    for kind, count in counts.most_common():
        color = rgb(EVENT_COLORS.get(kind, "#5850ec"))
        page.draw_circle((margin + 4, y - 3), 4, color=color, fill=color)
        page.insert_text((margin + 16, y), _label(kind), fontsize=9, color=navy)
        page.insert_text((page.rect.width - margin - 15, y), str(count), fontsize=9, fontname="hebo", color=navy)
        bar = pymupdf.Rect(margin, y + 8, page.rect.width - margin, y + 14)
        page.draw_rect(bar, color=border, fill=border, radius=0.5)
        fill = pymupdf.Rect(bar.x0, bar.y0, bar.x0 + bar.width * count / maximum, bar.y1)
        page.draw_rect(fill, color=color, fill=color, radius=0.5)
        y += 36

    events = list(payload.get("events", []))
    rows_per_page = 24
    for offset in range(0, max(len(events), 1), rows_per_page):
        page = new_page("Activity timeline")
        page.insert_text((margin, 73), "Complete event history with date, time, and measured intensity", fontsize=8.5, color=muted)
        y = 98
        page.draw_rect(pymupdf.Rect(margin, y, page.rect.width - margin, y + 26), color=canvas, fill=canvas)
        page.insert_text((margin + 10, y + 17), "EVENT", fontsize=7.5, fontname="hebo", color=muted)
        page.insert_text((285, y + 17), "DATE AND TIME", fontsize=7.5, fontname="hebo", color=muted)
        page.insert_text((page.rect.width - 93, y + 17), "INTENSITY", fontsize=7.5, fontname="hebo", color=muted)
        y += 26
        page_events = events[offset:offset + rows_per_page]
        if not page_events:
            page.insert_text((margin + 10, y + 24), "No activity was recorded.", fontsize=10, color=muted)
        for event in page_events:
            y += 27
            color = rgb(EVENT_COLORS.get(event["type"], "#5850ec"))
            page.draw_circle((margin + 7, y - 5), 4, color=color, fill=color)
            page.insert_text((margin + 19, y), _label(event["type"]), fontsize=8.5, color=navy)
            page.insert_text((285, y), _date_time(event["occurred_at"]), fontsize=8, color=muted)
            intensity = event.get("intensity")
            page.insert_text((page.rect.width - 83, y), "--" if intensity is None else f"{float(intensity) * 100:.0f}%", fontsize=8.5, color=navy)
            page.draw_line((margin, y + 8), (page.rect.width - margin, y + 8), color=border, width=0.5)

    page_count = document.page_count
    for number, report_page in enumerate(document, 1):
        report_page.insert_text((report_page.rect.width - 76, report_page.rect.height - 24), f"Page {number} of {page_count}", fontsize=7.5, color=muted)
    document.set_metadata({"title": "ProctorX Incident Report", "author": "ProctorX", "subject": str(payload["exam"])})
    document.save(path, garbage=4, deflate=True)
    document.close()


def build_report(payload: dict, fmt: str) -> dict:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    events = payload["events"]
    counts = Counter(event["type"] for event in events)
    score = payload.get("final_score") or {"score": 0, "tier": "Low", "factors": []}
    html = _report_html(payload, counts, score)
    stem = OUTPUT / f"{payload['session_id']}-incident-report"

    if fmt == "pdf":
        path = stem.with_suffix(".pdf")
        _build_pdf(payload, counts, score, path)
    elif fmt == "excel":
        path = stem.with_suffix(".xlsx")
        workbook = Workbook()
        summary = workbook.active
        summary.title = "Summary"
        summary.append(["ProctorX Department Report"])
        summary.append(["Student", payload["student"]])
        summary.append(["Exam", payload["exam"]])
        summary.append(["Final suspicion score", score["score"]])
        summary.append(["Tier", score["tier"]])
        events_sheet = workbook.create_sheet("Events")
        events_sheet.append(["Occurred at", "Type", "Intensity"])
        for event in events:
            events_sheet.append([event["occurred_at"], event["type"], event.get("intensity") or 0])
        workbook.save(path)
    else:
        path = stem.with_suffix(".html")
        path.write_text(html, encoding="utf-8")

    return {"path": str(path), "format": fmt}
