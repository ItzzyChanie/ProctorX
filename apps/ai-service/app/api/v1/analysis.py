from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from app.core.security import verify_internal_api_key
from app.services.face_analysis import analyzer
from app.services.audio_analysis import analyze_audio
router=APIRouter(prefix="/v1/analysis", tags=["analysis"])
@router.post("/face", dependencies=[Depends(verify_internal_api_key)])
async def face(session_id: str = Form(...), frame: UploadFile = File(...)):
    try: return analyzer.analyze(session_id, await frame.read())
    except ValueError as error: raise HTTPException(422, str(error))
@router.post("/audio", dependencies=[Depends(verify_internal_api_key)])
async def audio(chunk: UploadFile = File(...)):
    try: return analyze_audio(await chunk.read())
    except ValueError as error: raise HTTPException(422, str(error))
