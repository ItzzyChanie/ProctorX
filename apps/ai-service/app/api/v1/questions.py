import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from app.core.config import settings
from app.core.security import verify_internal_api_key
from app.services.document_extractor import DocumentExtractionError, extract_document
from app.services.question_generator import Counts, generate_questions

router = APIRouter(prefix="/v1/questions", tags=["questions"])


@router.post("/generate", dependencies=[Depends(verify_internal_api_key)])
async def generate(file: UploadFile = File(...), counts: str = Form(...)):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".pdf", ".ppt", ".pptx", ".docx"}:
        raise HTTPException(415, "Only PDF, PPT, PPTX, and DOCX files are supported")
    data = await file.read()
    if not data:
        raise HTTPException(422, "Uploaded file is empty")
    if len(data) > settings.max_document_size_mb * 1_000_000:
        raise HTTPException(413, f"Document exceeds the {settings.max_document_size_mb} MB size limit")
    try:
        requested = Counts.model_validate(json.loads(counts))
        text = extract_document(data, extension)
        draft = await generate_questions(text, requested)
        return draft.model_dump()
    except (json.JSONDecodeError, ValidationError, DocumentExtractionError, ValueError) as error:
        raise HTTPException(422, str(error)) from error
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error
