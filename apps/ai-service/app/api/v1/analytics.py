from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from scipy.stats import linregress
from app.core.security import verify_internal_api_key

router = APIRouter(prefix="/v1/analytics", tags=["analytics"])

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class Pair(StrictModel):
    suspicion_score: float = Field(ge=0, le=100)
    exam_score: float = Field(ge=0, le=100)

class CorrelationRequest(StrictModel):
    pairs: list[Pair] = Field(max_length=10_000)

def linear_regression(pairs: list[Pair]):
    if len(pairs) < 2 or len({pair.suspicion_score for pair in pairs}) < 2:
        return {"regressionLine": None, "insufficientData": True}

    result = linregress(
        [pair.suspicion_score for pair in pairs],
        [pair.exam_score for pair in pairs],
    )
    return {
        "slope": result.slope,
        "intercept": result.intercept,
        "r": result.rvalue,
        "r_squared": result.rvalue**2,
        "p_value": result.pvalue,
        "regressionLine": [
            {"suspicion": 0, "performance": result.intercept},
            {
                "suspicion": 100,
                "performance": result.intercept + result.slope * 100,
            },
        ],
        "insufficientData": False,
    }

@router.post("/correlation", dependencies=[Depends(verify_internal_api_key)])
def correlation(payload: CorrelationRequest):
    regression = linear_regression(payload.pairs)
    return {
        **regression,
        "pairs": [pair.model_dump() for pair in payload.pairs],
    }
