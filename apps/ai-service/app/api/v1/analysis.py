import asyncio
import json
import wave

import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.security import verify_internal_api_key
from app.services.audio_analysis import analyze_audio
from app.services.face_analysis import DEFAULT_SAMPLE_SECONDS, analyzer, pool_size

router = APIRouter(prefix="/v1/analysis", tags=["analysis"])

MAX_FRAME_BYTES = 5_000_000
MAX_AUDIO_BYTES = 10_000_000

# Backpressure: only as many analyses as there are MediaPipe instances run at
# once, so they never occupy the whole thread pool (fuzzy scoring and /health
# keep responding). When too many are already waiting, answer "busy"
# immediately; the backend just skips that sample.
_slots = asyncio.Semaphore(pool_size())
_waiting = 0
MAX_WAITING = pool_size() * 4


async def bounded(fn, *args):
    global _waiting
    if _waiting >= MAX_WAITING:
        raise HTTPException(503, "Analysis is busy; sample skipped")
    _waiting += 1
    try:
        await _slots.acquire()
    finally:
        _waiting -= 1
    try:
        return await run_in_threadpool(fn, *args)
    finally:
        _slots.release()


async def checked_upload(upload: UploadFile, allowed: set[str], maximum: int) -> bytes:
    if upload.content_type not in allowed:
        raise HTTPException(415, "Unsupported upload media type")
    data = await upload.read()
    if not data:
        raise HTTPException(422, "Uploaded file is empty")
    if len(data) > maximum:
        raise HTTPException(413, "Uploaded file exceeds the size limit")
    return data


@router.post("/face", dependencies=[Depends(verify_internal_api_key)])
async def face(
    session_id: str = Form(..., min_length=1, max_length=128),
    frame: UploadFile = File(...),
    sample_seconds: float = Form(DEFAULT_SAMPLE_SECONDS, ge=1, le=60),
    state: str | None = Form(None, max_length=500),
):
    data = await checked_upload(frame, {"image/jpeg", "image/png"}, MAX_FRAME_BYTES)
    try:
        previous = json.loads(state) if state else None
    except json.JSONDecodeError:
        previous = None
    try:
        return await bounded(analyzer.analyze, data, sample_seconds, previous)
    except ValueError as error:
        raise HTTPException(422, str(error))
    except (cv2.error, OSError) as error:
        raise HTTPException(422, "Unable to decode the uploaded image") from error


@router.post("/audio", dependencies=[Depends(verify_internal_api_key)])
async def audio(chunk: UploadFile = File(...)):
    data = await checked_upload(
        chunk,
        {"audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "video/webm"},
        MAX_AUDIO_BYTES,
    )
    try:
        return await bounded(analyze_audio, data)
    except (ValueError, wave.Error, EOFError) as error:
        raise HTTPException(422, str(error))
