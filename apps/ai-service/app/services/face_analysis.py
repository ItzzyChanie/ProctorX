import math
import os
import queue
import threading
from contextlib import contextmanager

import cv2
import mediapipe as mp
import numpy as np

DEFAULT_SAMPLE_SECONDS = 10
# A behaviour must persist this long (and over at least two frames) before it
# is reported, so a single blink or glance never becomes an incident.
MIN_PERSIST_SECONDS = 9
MIN_PERSIST_SAMPLES = 2
STREAK_KEYS = ("missing", "gaze", "mouth")


def pool_size() -> int:
    return max(1, int(os.getenv("FACE_ANALYZER_POOL", str(min(2, os.cpu_count() or 1)))))


def required_streak(sample_seconds: float) -> int:
    return max(MIN_PERSIST_SAMPLES, math.ceil(MIN_PERSIST_SECONDS / sample_seconds))


def clean_state(state: dict | None) -> dict[str, int]:
    """Streak counters sent back by the caller; anything malformed restarts at 0."""
    state = state if isinstance(state, dict) else {}
    result = {}
    for key in STREAK_KEYS:
        try:
            result[key] = max(0, min(1000, int(state.get(key, 0))))
        except (TypeError, ValueError):
            result[key] = 0
    return result


class FaceAnalyzer:
    """Stateless, thread-safe face analysis.

    The caller (backend) keeps each session's streak counters and sends them
    with every frame; the updated counters come back in the response. Because
    nothing is remembered between requests, the service can run as several
    processes (uvicorn --workers N) and use every CPU core.

    MediaPipe graphs are not safe to share between threads, so each process
    keeps a small pool of FaceMesh instances.
    """

    def __init__(self, size: int | None = None):
        self._pool: "queue.Queue[mp.solutions.face_mesh.FaceMesh]" = queue.Queue()
        self._created = 0
        self._max = size or pool_size()
        self._create_lock = threading.Lock()

    @contextmanager
    def _mesh(self):
        try:
            mesh = self._pool.get_nowait()
        except queue.Empty:
            with self._create_lock:
                create = self._created < self._max
                if create:
                    self._created += 1
            mesh = (
                mp.solutions.face_mesh.FaceMesh(
                    static_image_mode=True,
                    max_num_faces=2,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                )
                if create
                else self._pool.get()  # wait for a free instance
            )
        try:
            yield mesh
        finally:
            self._pool.put(mesh)

    def analyze(
        self,
        image: bytes,
        sample_seconds: float = DEFAULT_SAMPLE_SECONDS,
        state: dict | None = None,
    ):
        frame = cv2.imdecode(np.frombuffer(image, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Invalid image")
        sample_seconds = min(60.0, max(1.0, float(sample_seconds)))
        streak_needed = required_streak(sample_seconds)
        streak = clean_state(state)

        with self._mesh() as mesh:
            result = mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        faces = result.multi_face_landmarks or []

        streak["missing"] = streak["missing"] + 1 if not faces else 0
        missing = min(1.0, streak["missing"] / streak_needed)
        multi = min(1.0, max(0, len(faces) - 1))

        gaze = mouth = 0.0
        if faces:
            p = faces[0].landmark

            # Refined Face Mesh iris centers 468/473, eye corners 33/133 and 362/263.
            def relative(iris, outer, inner):
                return (p[iris].x - p[outer].x) / max(0.0001, p[inner].x - p[outer].x)

            left, right = relative(468, 33, 133), relative(473, 362, 263)
            deviation = max(abs(left - 0.5), abs(right - 0.5)) * 2
            streak["gaze"] = streak["gaze"] + 1 if deviation > 0.36 else 0
            gaze = min(1.0, streak["gaze"] / streak_needed * deviation)

            mar = abs(p[13].y - p[14].y) / max(0.0001, abs(p[78].x - p[308].x))
            streak["mouth"] = streak["mouth"] + 1 if mar > 0.15 else 0
            mouth = min(1.0, streak["mouth"] / streak_needed * min(1, mar / 0.3))
        else:
            streak["gaze"] = streak["mouth"] = 0

        def item(intensity: float, key: str):
            return {
                "event": intensity > 0 and streak[key] >= streak_needed,
                "intensity": round(float(intensity), 3),
                "duration_seconds": round(streak[key] * sample_seconds, 1),
            }

        return {
            "face_not_visible": item(missing, "missing"),
            "excessive_eye_movement": item(gaze, "gaze"),
            "possible_talking": item(mouth, "mouth"),
            "multiple_faces": {
                "event": len(faces) > 1,
                "intensity": round(multi, 3),
                "duration_seconds": sample_seconds if len(faces) > 1 else 0,
            },
            "face_count": len(faces),
            "state": streak,
        }


analyzer = FaceAnalyzer()
