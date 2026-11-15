from fastapi import FastAPI, Response
from pydantic import BaseModel

from app.api.v1.analysis import router as analysis_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.fuzzy import router as fuzzy_router
from app.api.v1.questions import router as questions_router

app = FastAPI(
    title="ProctorX AI Service",
    version="0.1.0",
    description="Evidence scoring service. Scores are review indicators, not verdicts.",
)

app.include_router(fuzzy_router)
app.include_router(analysis_router)
app.include_router(jobs_router)
app.include_router(analytics_router)
app.include_router(questions_router)

class ServiceStatus(BaseModel):
    service: str
    status: str
    docs: str | None = None
    health: str | None = None

@app.get("/", response_model=ServiceStatus)
async def root() -> ServiceStatus:
    return {
        "service": "proctorx-ai",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
    }

@app.get("/health", response_model=ServiceStatus)
async def health() -> ServiceStatus:
    return ServiceStatus(status="ok", service="proctorx-ai")

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)
