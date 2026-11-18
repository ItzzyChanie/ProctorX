"""Gemini JSON calls shared by question generation and review."""
from __future__ import annotations

from typing import Callable, TypeVar

import httpx

from app.core.config import settings

T = TypeVar("T")


async def _request(prompt: str, schema: dict, temperature: float) -> str:
    if settings.llm_provider.lower() != "gemini":
        raise RuntimeError("LLM_PROVIDER must be gemini")
    api_key = settings.gemini_api_key or settings.llm_api_key
    model = settings.llm_model or "gemini-3.5-flash-lite"
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema,
            "temperature": temperature,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=settings.question_generation_timeout_seconds) as client:
            response = await client.post(url, params={"key": api_key}, json=payload)
    except httpx.HTTPError as error:
        raise RuntimeError("Could not connect to the Gemini API") from error
    if response.status_code == 429:
        raise RuntimeError("Gemini free-tier rate limit reached. Please wait and try again")
    if response.is_error:
        try:
            detail = response.json().get("error", {}).get("message", "")
        except ValueError:
            detail = ""
        raise RuntimeError(f"Gemini request failed with status {response.status_code}: {detail}".rstrip())
    try:
        return response.json()["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, ValueError) as error:
        raise RuntimeError("Gemini returned an empty response") from error


async def call_gemini_json(
    prompt: str,
    schema: dict,
    parse: Callable[[str], T],
    temperature: float = 0.2,
    attempts: int = 2,
) -> T:
    """Calls Gemini and validates the JSON with `parse`.

    If the answer is malformed or breaks a rule (wrong number of questions,
    missing answers...), it retries once and tells the model what was wrong,
    instead of failing the teacher's whole request on a near miss.
    """
    feedback = ""
    last_error: Exception | None = None
    for _ in range(max(1, attempts)):
        raw = await _request(prompt + feedback, schema, temperature)
        try:
            return parse(raw)
        except ValueError as error:  # includes pydantic.ValidationError, JSONDecodeError
            last_error = error
            feedback = (
                "\n\nYOUR PREVIOUS ANSWER WAS REJECTED: "
                f"{str(error)[:500]}\nReturn a corrected answer that follows every rule above."
            )
    raise RuntimeError(f"Gemini returned an invalid answer: {last_error}")
