from fastapi import FastAPI, Response
from app.api.v1.fuzzy import router as fuzzy_router
from app.api.v1.analysis import router as analysis_router
app = FastAPI(title="ProctorX AI Service", version="0.1.0", description="Evidence scoring service. Scores are review indicators, not verdicts.")
app.include_router(fuzzy_router)
app.include_router(analysis_router)
@app.get("/")
def root(): return {"service": "proctorx-ai", "status": "ok", "docs": "/docs", "health": "/health"}
@app.get("/health")
def health(): return {"status": "ok", "service": "proctorx-ai"}
@app.get("/favicon.ico", include_in_schema=False)
def favicon(): return Response(status_code=204)
