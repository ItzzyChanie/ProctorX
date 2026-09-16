from __future__ import annotations

import json
from typing import Literal

import httpx
from pydantic import BaseModel, Field, model_validator

from app.core.config import settings


QuestionType = Literal["MULTIPLE_CHOICE", "ENUMERATION", "IDENTIFICATION", "ESSAY"]


class Counts(BaseModel):
    MULTIPLE_CHOICE: int = Field(default=0, ge=0, le=50)
    ENUMERATION: int = Field(default=0, ge=0, le=50)
    IDENTIFICATION: int = Field(default=0, ge=0, le=50)
    ESSAY: int = Field(default=0, ge=0, le=50)

    @model_validator(mode="after")
    def validate_total(self):
        total = sum(self.model_dump().values())
        if total < 1:
            raise ValueError("Set at least one question count")
        if total > settings.max_generated_questions:
            raise ValueError(f"A maximum of {settings.max_generated_questions} questions can be generated")
        return self


class Option(BaseModel):
    label: str = Field(min_length=1, max_length=500)
    isCorrect: bool


class GeneratedQuestion(BaseModel):
    type: QuestionType
    prompt: str = Field(min_length=1, max_length=5000)
    points: int = Field(default=1, ge=1, le=100)
    isRequired: bool = True
    answers: list[str] = Field(default_factory=list)
    rubric: str = ""
    options: list[Option] = Field(default_factory=list)
    sourceReference: str = ""


class GeneratedDraft(BaseModel):
    questions: list[GeneratedQuestion]


def _schema() -> dict:
    option = {
        "type": "object",
        "properties": {"label": {"type": "string"}, "isCorrect": {"type": "boolean"}},
        "required": ["label", "isCorrect"],
    }
    question = {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["MULTIPLE_CHOICE", "ENUMERATION", "IDENTIFICATION", "ESSAY"]},
            "prompt": {"type": "string"},
            "points": {"type": "integer"},
            "isRequired": {"type": "boolean"},
            "answers": {"type": "array", "items": {"type": "string"}},
            "rubric": {"type": "string"},
            "options": {"type": "array", "items": option},
            "sourceReference": {"type": "string"},
        },
        "required": ["type", "prompt", "points", "isRequired", "answers", "rubric", "options", "sourceReference"],
    }
    return {"type": "object", "properties": {"questions": {"type": "array", "items": question}}, "required": ["questions"]}


def _validate_semantics(draft: GeneratedDraft, counts: Counts) -> GeneratedDraft:
    requested = counts.model_dump()
    actual = {kind: 0 for kind in requested}
    prompts: set[str] = set()
    for question in draft.questions:
        actual[question.type] += 1
        key = question.prompt.casefold().strip()
        if key in prompts:
            raise ValueError("Gemini returned duplicate questions")
        prompts.add(key)
        if question.type == "MULTIPLE_CHOICE":
            if len(question.options) != 4 or sum(option.isCorrect for option in question.options) != 1:
                raise ValueError("Each multiple-choice question must have four options and exactly one correct answer")
        elif question.type in {"ENUMERATION", "IDENTIFICATION"} and not any(answer.strip() for answer in question.answers):
            raise ValueError(f"{question.type} questions require suggested answers")
        elif question.type == "ESSAY" and not question.rubric.strip():
            raise ValueError("Essay questions require a rubric")
    if actual != requested:
        raise ValueError("Gemini did not return the requested number of each question type")
    return draft


async def generate_questions(text: str, counts: Counts) -> GeneratedDraft:
    if settings.llm_provider.lower() != "gemini":
        raise RuntimeError("LLM_PROVIDER must be gemini")
    api_key = settings.gemini_api_key or settings.llm_api_key
    model = settings.llm_model or "gemini-3.5-flash-lite"
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    prompt = f"""Create an editable assessment draft using ONLY the source document below.
Requested counts: {json.dumps(counts.model_dump())}
Requirements: use content across all supplied source documents; exactly four plausible choices and one correct choice for multiple choice; enumeration answers must list all expected items; identification must have a concise accepted answer; essays need a suggested rubric; avoid duplicates; sourceReference must cite the source filename and its page or slide marker. Do not invent facts. If the sources cannot support the requested questions, fail rather than fabricate.

SOURCE DOCUMENT:
{text}"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": _schema(), "temperature": 0.2},
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
        raw = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        return _validate_semantics(GeneratedDraft.model_validate_json(raw), counts)
    except (KeyError, IndexError, json.JSONDecodeError, ValueError) as error:
        raise RuntimeError(f"Gemini returned an invalid question draft: {error}") from error
