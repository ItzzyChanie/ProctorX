from fastapi import Header, HTTPException, status
from .config import settings

def verify_internal_api_key(
    x_internal_api_key: str | None = Header(default=None),
) -> None:
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API key",
        )
