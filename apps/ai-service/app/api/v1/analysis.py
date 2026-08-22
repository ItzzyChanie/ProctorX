import wave
import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.security import verify_internal_api_key
from app.services.audio_analysis import analyze_audio
from app.services.face_analysis import analyzer

router = APIRouter(prefix="/v1/analysis", tags=["analysis"])

MAX_FRAME_BYTES = 5_000_000
MAX_AUDIO_BYTES = 10_000_000

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
async def face(session_id: str = Form(..., min_length=1, max_length=128), frame: UploadFile = File(...)):
    try:
        return analyzer.analyze(session_id, await checked_upload(frame, {"image/jpeg", "image/png"}, MAX_FRAME_BYTES))
    except ValueError as error:
        raise HTTPException(422, str(error))
    except (cv2.error, OSError) as error:
        raise HTTPException(422, "Unable to decode the uploaded image") from error


@router.post("/audio", dependencies=[Depends(verify_internal_api_key)])
async def audio(chunk: UploadFile = File(...)):
    try:
        return analyze_audio(await checked_upload(chunk, {"audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "video/webm"}, MAX_AUDIO_BYTES))
    except (ValueError, wave.Error, EOFError) as error:
        raise HTTPException(422, str(error))
