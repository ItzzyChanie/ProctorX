import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.security import verify_internal_api_key
from app.services.document_extractor import DocumentExtractionError, extract_document
from app.services.question_generator import (
    Counts,
    RewriteRequest,
    generate_questions,
    rewrite_question,
)
from app.services.question_reviewer import ReviewRequest, review_questions

TARGET_DIFFICULTIES = {"EASY", "MEDIUM", "HARD", "MIXED"}

router = APIRouter(prefix="/v1/questions", tags=["questions"])


@router.post("/generate", dependencies=[Depends(verify_internal_api_key)])
async def generate(
    files: list[UploadFile] = File(...),
    counts: str = Form(...),
    difficulty: str = Form("MIXED"),
):
    # Called directly in tests, where the Form default is not resolved.
    target = difficulty if isinstance(difficulty, str) and difficulty in TARGET_DIFFICULTIES else "MIXED"
    if not files:
        raise HTTPException(422, "Choose at least one document")
    if len(files) > settings.max_document_files:
        raise HTTPException(413, f"Upload at most {settings.max_document_files} documents")
    try:
        requested = Counts.model_validate(json.loads(counts))
        sources: list[str] = []
        total_bytes = 0
        for index, file in enumerate(files, start=1):
            filename = Path(file.filename or f"document-{index}").name
            extension = Path(filename).suffix.lower()
            if extension not in {".pdf", ".ppt", ".pptx", ".docx"}:
                raise DocumentExtractionError(f'Unsupported document "{filename}"')
            data = await file.read()
            if not data:
                raise DocumentExtractionError(f'Document "{filename}" is empty')
            if len(data) > settings.max_document_size_mb * 1_000_000:
                raise DocumentExtractionError(
                    f'Document "{filename}" exceeds the {settings.max_document_size_mb} MB size limit'
                )
            total_bytes += len(data)
            if total_bytes > settings.max_document_total_size_mb * 1_000_000:
                raise DocumentExtractionError(
                    f"Combined documents exceed the {settings.max_document_total_size_mb} MB size limit"
                )
            try:
                # Extraction can shell out to LibreOffice for up to a minute;
                # keep it off the event loop so monitoring keeps flowing.
                extracted = await run_in_threadpool(extract_document, data, extension)
            except DocumentExtractionError as error:
                raise DocumentExtractionError(
                    f'Could not read "{filename}": {error}'
                ) from error
            sources.append(f"[Source {index}: {filename}] - {extracted}")
        text = "\n\n".join(sources)
        if len(text) > settings.max_combined_document_characters:
            raise DocumentExtractionError(
                "The documents contain too much text to process together. Remove a document or split the assessment into smaller batches"
            )
        draft = await generate_questions(text, requested, target)
        # The extracted text is returned so the draft can be reviewed against it.
        return {**draft.model_dump(), "sourceText": text}
    except (json.JSONDecodeError, ValidationError, DocumentExtractionError, ValueError) as error:
        raise HTTPException(422, str(error)) from error
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error


@router.post("/review", dependencies=[Depends(verify_internal_api_key)])
async def review(request: ReviewRequest):
    """Advisory difficulty and quality review of a draft's questions."""
    try:
        report = await review_questions(request)
        return report.model_dump()
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error


@router.post("/rewrite", dependencies=[Depends(verify_internal_api_key)])
async def rewrite(request: RewriteRequest):
    """Rewrites one question to match the teacher's chosen difficulty."""
    try:
        question = await rewrite_question(request)
        return question.model_dump()
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error
