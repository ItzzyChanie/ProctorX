from app.api.v1.jobs import ReportRequest


def test_report_request_accepts_structured_fuzzy_factors():
    request = ReportRequest.model_validate({
        "format": "pdf",
        "payload": {
            "session_id": "session-1",
            "student": "Student Name",
            "exam": "CS101 - Final Exam",
            "events": [{
                "type": "TAB_SWITCH",
                "intensity": 0.5,
                "occurred_at": "2026-08-22T10:00:00.000Z",
                "evidence_path": None,
            }],
            "final_score": {
                "score": 42,
                "tier": "MEDIUM",
                "factors": [{
                    "indicator": "tab_switch_count",
                    "value": 2,
                    "membership": "medium",
                }],
            },
        },
    })
    assert request.payload.final_score.factors[0]["indicator"] == "tab_switch_count"
