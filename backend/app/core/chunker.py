from langchain_text_splitters import RecursiveCharacterTextSplitter

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=50,
    length_function=len,
)


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks for embedding."""
    return _splitter.split_text(text)
