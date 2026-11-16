import asyncio
import json
import os

os.environ.setdefault("INTERNAL_API_KEY", "x" * 40)

import pytest

from app.services import gemini, question_generator, question_reviewer
from app.services.question_generator import RewriteRequest
from app.services.question_reviewer import ReviewRequest


def _review_item(index: int, difficulty: str = "EASY") -> dict:
    return {
        "index": index,
        "estimatedDifficulty": difficulty,
        "confidence": 0.8,
        "bloomLevel": "REMEMBER",
        "estimatedSeconds": 30,
        "reasons": ["Answer is stated directly on Slide 2"],
        "issues": [],
        "suggestion": "",
    }


def _request(count: int = 2) -> ReviewRequest:
    return ReviewRequest(
        title="Quiz 1",
        duration_minutes=30,
        questions=[
            {"index": i, "type": "IDENTIFICATION", "prompt": f"Q{i}", "points": 1, "difficulty": "HARD", "answers": ["x"]}
            for i in range(count)
        ],
    )


def test_review_covers_every_question(monkeypatch):
    responses = iter([json.dumps({"questions": [_review_item(1), _review_item(0)], "overall": "ok", "coverage": "ok"})])

    async def fake_request(prompt, schema, temperature):
        return next(responses)

    monkeypatch.setattr(gemini, "_request", fake_request)
    report = asyncio.run(question_reviewer.review_questions(_request()))
    assert [item.index for item in report.questions] == [0, 1]
    assert report.questions[0].estimatedDifficulty == "EASY"


def test_invalid_answer_is_retried_once_with_feedback(monkeypatch):
    prompts: list[str] = []
    responses = iter(
        [
            json.dumps({"questions": [_review_item(0)], "overall": "", "coverage": ""}),  # misses Q1
            json.dumps({"questions": [_review_item(0), _review_item(1)], "overall": "", "coverage": ""}),
        ]
    )

    async def fake_request(prompt, schema, temperature):
        prompts.append(prompt)
        return next(responses)

    monkeypatch.setattr(gemini, "_request", fake_request)
    report = asyncio.run(question_reviewer.review_questions(_request()))
    assert len(report.questions) == 2
    assert len(prompts) == 2
    assert "PREVIOUS ANSWER WAS REJECTED" in prompts[1]


def test_gives_up_after_the_retry(monkeypatch):
    async def fake_request(prompt, schema, temperature):
        return json.dumps({"questions": [], "overall": "", "coverage": ""})

    monkeypatch.setattr(gemini, "_request", fake_request)
    with pytest.raises(RuntimeError):
        asyncio.run(question_reviewer.review_questions(_request()))


def test_rewrite_keeps_the_question_type(monkeypatch):
    rewritten = {
        "type": "IDENTIFICATION",
        "prompt": "Which key enforces referential integrity between two tables?",
        "points": 1,
        "isRequired": True,
        "answers": ["Foreign key"],
        "rubric": "",
        "options": [],
        "sourceReference": "db.pptx, Slide 3",
        "difficulty": "MEDIUM",
        "bloomLevel": "UNDERSTAND",
    }

    async def fake_request(prompt, schema, temperature):
        return json.dumps(rewritten)

    monkeypatch.setattr(gemini, "_request", fake_request)
    question = asyncio.run(
        question_generator.rewrite_question(
            RewriteRequest(
                question={"type": "IDENTIFICATION", "prompt": "What is a foreign key?", "answers": ["Foreign key"]},
                target_difficulty="MEDIUM",
            )
        )
    )
    assert question.type == "IDENTIFICATION"
    assert question.difficulty == "MEDIUM"
