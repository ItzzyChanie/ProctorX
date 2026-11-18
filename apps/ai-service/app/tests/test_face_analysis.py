import os
import time
from concurrent.futures import ThreadPoolExecutor

os.environ.setdefault("INTERNAL_API_KEY", "x" * 40)

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.services.face_analysis import FaceAnalyzer, clean_state, required_streak


def blank_jpeg() -> bytes:
    ok, encoded = cv2.imencode(".jpg", np.full((240, 320, 3), 127, np.uint8))
    assert ok
    return encoded.tobytes()


def test_required_streak_is_time_based():
    assert required_streak(3) == 3  # previous behaviour at 3 s sampling
    assert required_streak(10) == 2  # never a single frame
    assert required_streak(30) == 2


def test_streaks_travel_with_the_request():
    analyzer = FaceAnalyzer(size=1)
    frame = blank_jpeg()
    first = analyzer.analyze(frame, 10, None)
    assert first["face_count"] == 0
    assert first["face_not_visible"]["event"] is False
    assert first["state"]["missing"] == 1
    # The caller sends the returned counters with the next frame.
    second = analyzer.analyze(frame, 10, first["state"])
    assert second["face_not_visible"]["event"] is True
    assert second["face_not_visible"]["duration_seconds"] == 20
    # Without state (e.g. a new attempt) nothing carries over.
    assert analyzer.analyze(frame, 10, None)["face_not_visible"]["event"] is False


def test_malformed_state_is_ignored():
    assert clean_state({"missing": "x", "gaze": -5, "mouth": 10**9}) == {
        "missing": 0,
        "gaze": 0,
        "mouth": 1000,
    }
    assert clean_state("nonsense") == {"missing": 0, "gaze": 0, "mouth": 0}


def test_parallel_analysis_is_safe():
    analyzer = FaceAnalyzer(size=2)
    frame = blank_jpeg()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: analyzer.analyze(frame, 10, None), range(32)))
    assert all(result["face_count"] == 0 for result in results)
    assert analyzer._created <= 2


def _slow(monkeypatch, seconds: float):
    from app.services import face_analysis

    def slow_analyze(*_args, **_kwargs):
        time.sleep(seconds)
        return {"face_count": 0, "state": {}}

    monkeypatch.setattr(face_analysis.analyzer, "analyze", slow_analyze)


def _post_frame(client):
    from app.core.config import settings

    return client.post(
        "/v1/analysis/face",
        headers={"X-Internal-Api-Key": settings.internal_api_key},
        data={"session_id": "s1", "sample_seconds": "10"},
        files={"frame": ("f.jpg", blank_jpeg(), "image/jpeg")},
    )


def test_face_analysis_does_not_block_other_requests(monkeypatch):
    from app.main import app

    _slow(monkeypatch, 1.0)
    # One shared event loop (as in production), so blocking would be visible.
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=2) as pool:
        slow = pool.submit(_post_frame, client)
        time.sleep(0.2)
        started = time.monotonic()
        health = client.get("/health")
        elapsed = time.monotonic() - started
        assert slow.result().status_code == 200
    assert health.status_code == 200
    assert elapsed < 0.5, f"health check waited {elapsed:.2f}s behind face analysis"


def test_overload_is_rejected_quickly_instead_of_queueing(monkeypatch):
    from app.api.v1 import analysis
    from app.main import app

    _slow(monkeypatch, 0.5)
    burst = analysis.MAX_WAITING + analysis.pool_size() + 6
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=burst) as pool:
        statuses = [r.status_code for r in pool.map(lambda _: _post_frame(client), range(burst))]
    assert statuses.count(200) >= analysis.pool_size()
    assert 503 in statuses, "excess frames should be skipped with 503"
