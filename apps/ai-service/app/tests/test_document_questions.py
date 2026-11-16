import io
import asyncio

import pymupdf
import pytest
from starlette.datastructures import UploadFile
from pptx import Presentation
from docx import Document

from app.api.v1 import questions as questions_api
from app.services.document_extractor import DocumentExtractionError, extract_document
from app.services.question_generator import Counts, GeneratedDraft, _validate_semantics


def test_extracts_pdf_text_with_page_reference():
    document = pymupdf.open()
    page = document.new_page()
    page.insert_textbox((72, 72, 500, 160), "Operating systems manage computer hardware and application resources for users. They schedule processes, manage memory, and provide stable services to programs.")
    result = extract_document(document.tobytes(), ".pdf")
    assert "[Page 1]" in result
    assert "Operating systems" in result


def test_extracts_pptx_text_with_slide_reference():
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[1])
    slide.shapes.title.text = "Database Management"
    slide.placeholders[1].text = "A primary key uniquely identifies each record in a relational database table."
    buffer = io.BytesIO()
    presentation.save(buffer)
    result = extract_document(buffer.getvalue(), ".pptx")
    assert "[Slide 1]" in result
    assert "primary key" in result


def test_extracts_docx_paragraphs_and_tables():
    document = Document()
    document.add_paragraph(
        "Computer networks connect devices so they can exchange data and share resources securely."
    )
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "Protocol"
    table.cell(0, 1).text = "HTTP"
    buffer = io.BytesIO()
    document.save(buffer)
    result = extract_document(buffer.getvalue(), ".docx")
    assert "Computer networks" in result
    assert "Protocol | HTTP" in result


def test_rejects_documents_without_enough_text():
    document = pymupdf.open()
    document.new_page()
    with pytest.raises(DocumentExtractionError, match="enough readable text"):
        extract_document(document.tobytes(), ".pdf")


def test_validates_requested_question_counts_and_answers():
    draft = GeneratedDraft.model_validate({"questions": [{
        "type": "IDENTIFICATION",
        "prompt": "What uniquely identifies a relational table record?",
        "answers": ["Primary key"],
        "sourceReference": "Slide 1",
    }]})
    assert _validate_semantics(draft, Counts(IDENTIFICATION=1)).questions[0].answers == ["Primary key"]


def test_generate_reads_mixed_documents_and_preserves_source_names(monkeypatch):
    pdf = pymupdf.open()
    page = pdf.new_page()
    page.insert_textbox(
        (72, 72, 500, 180),
        "Operating systems coordinate processes, memory, devices, and application resources. "
        "This lesson explains scheduling, memory management, storage, and system services.",
    )
    pdf_bytes = pdf.tobytes()
    pdf.close()

    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[1])
    slide.shapes.title.text = "Relational Databases"
    slide.placeholders[1].text = (
        "A primary key uniquely identifies every record while a foreign key connects "
        "related tables and preserves referential integrity in a database."
    )
    pptx = io.BytesIO()
    presentation.save(pptx)

    captured: dict[str, str] = {}

    async def fake_generate(text: str, counts: Counts, difficulty: str = "MIXED"):
        captured["text"] = text
        return GeneratedDraft.model_validate(
            {
                "questions": [
                    {
                        "type": "IDENTIFICATION",
                        "prompt": "What uniquely identifies a database record?",
                        "answers": ["Primary key"],
                        "sourceReference": "databases.pptx, Slide 1",
                    }
                ]
            }
        )

    monkeypatch.setattr(questions_api, "generate_questions", fake_generate)
    result = asyncio.run(
        questions_api.generate(
            files=[
                UploadFile(io.BytesIO(pdf_bytes), filename="systems.pdf"),
                UploadFile(io.BytesIO(pptx.getvalue()), filename="databases.pptx"),
            ],
            counts='{"IDENTIFICATION": 1}',
        )
    )

    assert len(result["questions"]) == 1
    assert "[Source 1: systems.pdf]" in captured["text"]
    assert "[Page 1]" in captured["text"]
    assert "[Source 2: databases.pptx]" in captured["text"]
    assert "[Slide 1]" in captured["text"]
