import hmac

from fastapi import Header, HTTPException, status
from .config import settings


def verify_internal_api_key(
    x_internal_api_key: str | None = Header(default=None),
) -> None:
    # Constant-time comparison so the key cannot be guessed byte by byte.
    if not x_internal_api_key or not hmac.compare_digest(
        x_internal_api_key.encode(), settings.internal_api_key.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API key",
        )
