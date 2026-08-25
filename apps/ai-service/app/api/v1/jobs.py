from fastapi import APIRouter, Depends, HTTPException, Path
from celery.result import AsyncResult
from pydantic import BaseModel, ConfigDict, Field
from typing import Any

from app.core.celery_app import celery_app
from app.core.security import verify_internal_api_key
from app.tasks import build_report_task
from kombu.exceptions import OperationalError

router = APIRouter(prefix="/v1/jobs", tags=["jobs"])

class ReportPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str = Field(min_length=1, max_length=128)
    student: str = Field(min_length=1, max_length=200)
    exam: str = Field(min_length=1, max_length=300)
    events: list["ReportEvent"] = Field(max_length=50_000)
    final_score: "FinalScore"

class ReportEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str = Field(min_length=1, max_length=100)
    intensity: float | int | None = Field(default=None, ge=0, le=1)
    occurred_at: str = Field(min_length=1, max_length=64)
    evidence_path: str | None = Field(default=None, max_length=1024)

class FinalScore(BaseModel):
    model_config = ConfigDict(extra="forbid")
    score: int = Field(ge=0, le=100)
    tier: str = Field(min_length=1, max_length=20)
    factors: list[str | dict[str, Any]] = Field(default_factory=list, max_length=100)

class ReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payload: ReportPayload
    format: str

@router.post("/reports", dependencies=[Depends(verify_internal_api_key)])
def report(request: ReportRequest):
    if request.format not in {"pdf", "html", "excel"}:
        raise HTTPException(
            status_code=422,
            detail="format must be pdf, html, or excel",
        )

    try:
        task = build_report_task.delay(request.payload.model_dump(), request.format)
    except OperationalError as error:
        raise HTTPException(status_code=503, detail="The report job queue is unavailable") from error
    return {"job_id": task.id, "status": "PENDING"}

@router.get("/{job_id}", dependencies=[Depends(verify_internal_api_key)])
def status(job_id: str = Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9-]+$")):
    task = AsyncResult(job_id, app=celery_app)
    error = str(task.result) if task.failed() else None
    return {
        "job_id": job_id,
        "status": task.status,
        "result": task.result if task.successful() else None,
        "error": error,
    }
