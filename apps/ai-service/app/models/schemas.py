from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

class ReducedIndicators(StrictModel):
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

class FuzzyScoreRequest(StrictModel):
    session_id: str = Field(min_length=1, max_length=128)
    student_id: str = Field(min_length=1, max_length=128)
    indicators: ReducedIndicators | FullIndicators
    rule_set: Literal["reduced", "full"] = "reduced"

class ContributingFactor(StrictModel):
    indicator: str
    value: float | int
    membership: str

class FuzzyScoreResponse(StrictModel):
    suspicion_score: int
    tier: Literal["Low", "Medium", "High"]
    contributing_factors: list[ContributingFactor]
    computed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
