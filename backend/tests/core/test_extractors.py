from pathlib import Path

import pytest

from app.core.extractors import extract_text

ASSETS_DIR = Path(__file__).parent.parent / "assets"


def test_extract_text_from_pdf_returns_nonempty_text():
    text = extract_text(
        str(ASSETS_DIR / "vectorshift_resume.pdf"), "vectorshift_resume.pdf"
    )

    assert len(text.strip()) > 1000


def test_extract_text_from_txt_returns_file_contents(tmp_path):
    file_path = tmp_path / "notes.txt"
    file_path.write_text("Hello world\n\nSecond paragraph.", encoding="utf-8")

    text = extract_text(str(file_path), "notes.txt")

    assert text == "Hello world\n\nSecond paragraph."


def test_extract_text_from_md_returns_file_contents(tmp_path):
    file_path = tmp_path / "notes.md"
    file_path.write_text("# Heading\n\nBody text.", encoding="utf-8")

    text = extract_text(str(file_path), "notes.md")

    assert text == "# Heading\n\nBody text."


def test_extract_text_raises_for_unsupported_extension(tmp_path):
    file_path = tmp_path / "sheet.xlsx"
    file_path.write_bytes(b"")

    with pytest.raises(ValueError, match="Unsupported file type"):
        extract_text(str(file_path), "sheet.xlsx")
