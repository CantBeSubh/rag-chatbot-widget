from pathlib import Path

import pypdf


def extract_text(file_path: str, filename: str) -> str:
    """Extract plain text from a PDF, TXT, or MD file."""
    suffix = Path(filename).suffix.lower()

    if suffix == ".pdf":
        reader = pypdf.PdfReader(file_path)
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(pages)

    if suffix in (".txt", ".md"):
        with open(file_path, encoding="utf-8") as f:
            return f.read()

    raise ValueError(f"Unsupported file type: {suffix}")
