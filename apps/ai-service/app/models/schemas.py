from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field

class ReducedIndicators(BaseModel):
    tab_switch_count: int = Field(ge=0, default=0)
    blacklisted_app_seconds: float = Field(ge=0, default=0)
    idle_seconds: float = Field(ge=0, default=0)
    usb_event_count: int = Field(ge=0, default=0)

class FullIndicators(ReducedIndicators):
    face_not_visible: float | None = Field(default=None, ge=0, le=1)
    excessive_eye_movement: float | None = Field(default=None, ge=0, le=1)
    possible_talking: float | None = Field(default=None, ge=0, le=1)
    multiple_faces: float | None = Field(default=None, ge=0, le=1)
    voice_detected: float | None = Field(default=None, ge=0, le=1)

class FuzzyScoreRequest(BaseModel):
    session_id: str
    student_id: str
    indicators: ReducedIndicators | FullIndicators
    rule_set: Literal["reduced", "full"] = "reduced"

class ContributingFactor(BaseModel):
    indicator: str
    value: float | int
    membership: str

class FuzzyScoreResponse(BaseModel):
    suspicion_score: int
    tier: Literal["Low", "Medium", "High"]
    contributing_factors: list[ContributingFactor]
    computed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
