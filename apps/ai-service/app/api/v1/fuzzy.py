from fastapi import APIRouter, Depends
from app.core.security import verify_internal_api_key
from app.models.schemas import FuzzyScoreRequest, FuzzyScoreResponse
from app.services.fuzzy_engine import engine

router = APIRouter(prefix="/v1/fuzzy", tags=["fuzzy"])

@router.post(
    "/score",
    response_model=FuzzyScoreResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
def score(payload: FuzzyScoreRequest) -> FuzzyScoreResponse:
    suspicion_score, tier, factors = engine.score_indicators(
        payload.indicators, payload.rule_set
    )
    return FuzzyScoreResponse(
        suspicion_score=suspicion_score,
        tier=tier,
        contributing_factors=factors,
    )
