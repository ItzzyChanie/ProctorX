from __future__ import annotations

import io
import subprocess
import tempfile
from pathlib import Path

import pymupdf
from pptx import Presentation
from docx import Document

from app.core.config import settings


class DocumentExtractionError(ValueError):
    pass


def _extract_pdf(data: bytes) -> str:
    try:
        document = pymupdf.open(stream=data, filetype="pdf")
        sections = [f"[Page {index + 1}]\n{page.get_text('text').strip()}" for index, page in enumerate(document)]
        document.close()
        return "\n\n".join(section for section in sections if section.split("\n", 1)[-1].strip())
    except (pymupdf.FileDataError, RuntimeError) as error:
        raise DocumentExtractionError("Unable to read the uploaded PDF") from error


def _extract_pptx(data: bytes) -> str:
    try:
        presentation = Presentation(io.BytesIO(data))
    except Exception as error:
        raise DocumentExtractionError("Unable to read the uploaded PowerPoint file") from error
    sections: list[str] = []
    for index, slide in enumerate(presentation.slides, start=1):
        values: list[str] = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                values.append(shape.text.strip())
            if getattr(shape, "has_table", False):
                for row in shape.table.rows:
                    values.append(" | ".join(cell.text.strip() for cell in row.cells))
        if values:
            sections.append(f"[Slide {index}]\n" + "\n".join(values))
    return "\n\n".join(sections)


def _convert_ppt(data: bytes) -> bytes:
    executable = Path(settings.libreoffice_path)
    if not executable.is_file():
        raise DocumentExtractionError("LibreOffice is not installed or LIBREOFFICE_PATH is incorrect")
    with tempfile.TemporaryDirectory(prefix="proctorx-ppt-") as directory:
        root = Path(directory)
        source = root / "source.ppt"
        source.write_bytes(data)
        try:
            result = subprocess.run(
                [str(executable), "--headless", "--convert-to", "pptx:Impress MS PowerPoint 2007 XML", "--outdir", str(root), str(source)],
                capture_output=True,
                check=False,
                timeout=settings.libreoffice_conversion_timeout_seconds,
            )
        except subprocess.TimeoutExpired as error:
            raise DocumentExtractionError("Legacy PPT conversion timed out") from error
        converted = root / "source.pptx"
        if result.returncode != 0 or not converted.is_file():
            raise DocumentExtractionError("The legacy PPT file could not be converted")
        return converted.read_bytes()


def _extract_docx(data: bytes) -> str:
    try:
        document = Document(io.BytesIO(data))
    except Exception as error:
        raise DocumentExtractionError("Unable to read the uploaded Word document") from error
    sections: list[str] = []
    for paragraph in document.paragraphs:
        if paragraph.text.strip():
            sections.append(paragraph.text.strip())
    for table in document.tables:
        for row in table.rows:
            values = [cell.text.strip() for cell in row.cells]
            if any(values):
                sections.append(" | ".join(values))
    return "\n".join(sections)


def extract_document(data: bytes, extension: str) -> str:
    extension = extension.lower()
    if extension == ".pdf":
        text = _extract_pdf(data)
    elif extension == ".pptx":
        text = _extract_pptx(data)
    elif extension == ".ppt":
        text = _extract_pptx(_convert_ppt(data))
    elif extension == ".docx":
        text = _extract_docx(data)
    else:
        raise DocumentExtractionError("Only PDF, PPT, PPTX, and DOCX files are supported")
    normalized = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    if len(normalized) < 100:
        raise DocumentExtractionError("The document does not contain enough readable text. Scanned PDFs require OCR")
    return normalized[: settings.max_document_characters]
