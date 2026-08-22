import io

import pymupdf
import pytest
from pptx import Presentation

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
