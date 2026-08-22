import base64
from collections import defaultdict

import cv2
import mediapipe as mp
import numpy as np

SAMPLE_SECONDS = 3
class FaceAnalyzer:

    def __init__(self):
        self.mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=2,
            refine_landmarks=True,
            min_detection_confidence=0.5,
        )
        self.state = defaultdict(
            lambda: {"missing": 0, "gaze": 0, "mouth": 0}
        )

    def analyze(self, session_id: str, image: bytes):
        frame = cv2.imdecode(np.frombuffer(image, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Invalid image")

        result = self.mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        faces = result.multi_face_landmarks or []
        state = self.state[session_id]

        state["missing"] = state["missing"] + 1 if not faces else 0
        missing = min(1.0, state["missing"] / 3)
        multi = min(1.0, max(0, len(faces) - 1))

        gaze = mouth = 0.0
        if faces:
            p = faces[0].landmark

            # Refined Face Mesh iris centers 468/473, eye corners 33/133 and 362/263.
            def relative(iris, outer, inner):
                return (p[iris].x - p[outer].x) / max(
                    0.0001, p[inner].x - p[outer].x
                )

            left, right = relative(468, 33, 133), relative(473, 362, 263)
            deviation = max(abs(left - 0.5), abs(right - 0.5)) * 2
            state["gaze"] = state["gaze"] + 1 if deviation > 0.36 else 0
            gaze = min(1.0, state["gaze"] / 3 * deviation)

            mar = abs(p[13].y - p[14].y) / max(0.0001, abs(p[78].x - p[308].x))
            state["mouth"] = state["mouth"] + 1 if mar > 0.15 else 0
            mouth = min(1.0, state["mouth"] / 3 * min(1, mar / 0.3))

        def item(intensity, streak, key):
            return {
                "event": (
                    intensity > 0 and state[key] >= 3
                    if key in state
                    else intensity > 0
                ),
                "intensity": round(float(intensity), 3),
                "duration_seconds": (
                    state[key] if key in state else int(intensity > 0)
                )
                * SAMPLE_SECONDS,
            }

        return {
            "face_not_visible": item(missing, state["missing"], "missing"),
            "excessive_eye_movement": item(gaze, state["gaze"], "gaze"),
            "possible_talking": item(mouth, state["mouth"], "mouth"),
            "multiple_faces": {
                "event": len(faces) > 1,
                "intensity": round(multi, 3),
                "duration_seconds": SAMPLE_SECONDS if len(faces) > 1 else 0,
            },
            "face_count": len(faces),
        }
    
analyzer = FaceAnalyzer()
