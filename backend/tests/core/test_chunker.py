from app.core.chunker import chunk_text

_LONG_TEXT = " ".join(
    f"This is sentence number {i} in a long document about testing chunking behavior."
    for i in range(40)
)


def test_chunk_text_returns_empty_list_for_empty_string():
    assert chunk_text("") == []


def test_chunk_text_returns_single_chunk_for_short_text():
    text = "Hello world, this is short."

    assert chunk_text(text) == [text]


def test_chunk_text_splits_long_text_into_chunks_within_size_limit():
    chunks = chunk_text(_LONG_TEXT)

    assert len(chunks) > 1
    assert all(len(chunk) <= 512 for chunk in chunks)


def test_chunk_text_overlaps_consecutive_chunks():
    chunks = chunk_text(_LONG_TEXT)

    assert chunks[0][-30:] in chunks[1]
