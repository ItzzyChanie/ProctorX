"""Shared rules for writing and judging exam questions.

Generation, rewriting and review all use the same definitions, so the
difficulty the generator aims for is the one the reviewer checks.
"""
from __future__ import annotations

import re

STANDALONE_RULES = """Write questions like a real exam a student answers WITHOUT the teacher's files:
- Every question must be self-contained and make sense to a student who never saw the
  uploaded material. The material is the KNOWLEDGE SOURCE, not the subject of the question.
- Never refer to the material itself: no "according to the slide/lesson/document/
  presentation/module/handout", "in the reading", "as discussed/shown", "the author",
  "the presenter/speaker", page or slide numbers, or the file name.
- Do not ask about people, places or examples that only exist inside the material
  (e.g. a presenter or a sample character). Well-known figures of the field are fine
  (e.g. Alan Turing, Edsger Dijkstra, Tim Berners-Lee) if the question is about their
  contribution to the subject.
- Ask about the concepts and skills the material teaches. The correct answer must still
  be supported by the material - do not invent facts.
- sourceReference (file and page/slide) is only for the teacher and must never appear in
  the question text or choices."""

DIFFICULTY_GUIDE = """Difficulty for CS/IT undergraduates (Bloom's level in brackets):
- EASY [Remember/Understand]: define or identify a term, recall a fact, list items.
- MEDIUM [Apply/Analyze]: explain why or how; apply a concept to a short NEW scenario;
  classify an example; compare two concepts; trace a short algorithm or code snippet
  (<= 10 lines); choose the right tool, command or structure for a situation.
- HARD [Analyze/Evaluate/Create]: multi-step reasoning about an unfamiliar scenario;
  predict the output of or debug non-trivial code; evaluate trade-offs between
  approaches; combine concepts from different parts of the material.
A MEDIUM or HARD question must NOT be answerable by finding one sentence in the material."""

DIFFICULTY_EXAMPLES = """Calibration examples (topic: data structures):
- EASY: "What is the time complexity of accessing an element of an array by its index?"
- MEDIUM: "A clinic must always serve the patient with the most urgent condition first,
  even if others arrived earlier. Which data structure fits best, and why?"
- HARD: "A function pushes every node of a binary tree onto a stack and pops them to
  visit them. In what order are the nodes of the tree [A [B D E] C] visited, and how
  would the order change with a queue?"
- NOT ACCEPTABLE (depends on the source): "According to the slide, what did the
  presenter say about stacks?" """

_SOURCE_REFERENCE = re.compile(
    r"\b(?:according\s+to|based\s+on|from|in|on|per|refer\s+to)\s+(?:the|this|our)\s+"
    r"(?:slides?|lessons?|modules?|documents?|presentations?|readings?|handouts?|materials?|"
    r"lectures?|decks?|files?|pdfs?|ppts?|powerpoints?|notes?|text)\b"
    r"|\b(?:slide|page)\s*(?:#\s*)?\d+\b"
    r"|\bthe\s+(?:author|presenter|speaker|lecturer|resource\s+person)\b"
    r"|\bas\s+(?:discussed|mentioned|shown|stated|presented|described)\b",
    re.IGNORECASE,
)


def source_reference(text: str) -> str | None:
    """The phrase that makes a question depend on the uploaded material, if any."""
    match = _SOURCE_REFERENCE.search(text or "")
    return match.group(0) if match else None
