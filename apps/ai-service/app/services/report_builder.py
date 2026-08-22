from collections import Counter
from html import escape
from pathlib import Path

import fitz
from openpyxl import Workbook

OUTPUT = Path(__file__).resolve().parents[3] / "storage" / "reports"


def build_report(payload: dict, fmt: str) -> dict:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    events = payload["events"]
    counts = Counter(event["type"] for event in events)

    timeline = "".join(
        f"<tr><td>{escape(event['occurred_at'])}</td>"
        f"<td>{escape(event['type'].replace('_', ' '))}</td>"
        f"<td>{event.get('intensity') or 0:.2f}</td></tr>"
        for event in events
    )

    heatmap = (
        "".join(
            f"<li>{escape(kind.replace('_', ' '))}: {count}</li>"
            for kind, count in counts.items()
        )
        or "<li>No recorded violations</li>"
    )

    score = payload.get("final_score") or {
        "score": 0,
        "tier": "Low",
        "factors": [],
    }

    html = f"""<!doctype html><html><head><style>body{{font-family:Arial;margin:40px}}h1{{color:#2922aa}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #ddd;padding:8px}}.heatmap{{display:flex;gap:12px;flex-wrap:wrap}}.heatmap li{{background:#f4f1ff;padding:12px;list-style:none}}</style></head><body><h1>ProctorX Incident Report</h1><p><b>Student:</b> {escape(payload['student'])}<br><b>Exam:</b> {escape(payload['exam'])}<br><b>Session:</b> {escape(payload['session_id'])}</p><h2>Final suspicion score: {score['score']} ({escape(score['tier'])})</h2><h2>Violations summary / heatmap</h2><ul class='heatmap'>{heatmap}</ul><h2>Activity timeline</h2><table><thead><tr><th>Time</th><th>Event</th><th>Intensity</th></tr></thead><tbody>{timeline}</tbody></table></body></html>"""

    stem = OUTPUT / f"{payload['session_id']}-incident-report"

    if fmt == "pdf":
        path = stem.with_suffix(".pdf")
        document = fitz.open()
        page = document.new_page()
        writer = page.insert_textbox

        lines = [
            "ProctorX Incident Report",
            f"Student: {payload['student']}",
            f"Exam: {payload['exam']}",
            f"Session: {payload['session_id']}",
            f"Final suspicion score: {score['score']} ({score['tier']})",
            "",
            "Violations summary",
        ]
        lines += [
            f"- {kind.replace('_', ' ')}: {count}"
            for kind, count in counts.items()
        ] or ["- No recorded violations"]
        lines += ["", "Activity timeline"] + [
            f"{event['occurred_at']} | {event['type']} | intensity {event.get('intensity') or 0:.2f}"
            for event in events
        ]

        writer(
            fitz.Rect(45, 45, 550, 790),
            "\n".join(lines),
            fontsize=10,
            fontname="helv",
            lineheight=1.5,
        )
        document.save(path)
        document.close()

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
            events_sheet.append([
                event["occurred_at"],
                event["type"],
                event.get("intensity") or 0,
            ])

        workbook.save(path)

    else:
        path = stem.with_suffix(".html")
        path.write_text(html, encoding="utf-8")

    return {"path": str(path), "format": fmt}
