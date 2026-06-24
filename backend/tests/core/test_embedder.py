import math

from app.core.embedder import embed


def test_embed_returns_one_vector_per_input_text():
    vectors = embed(["hello world", "goodbye world", "another sentence"])

    assert len(vectors) == 3


def test_embed_returns_768_dimensional_vectors():
    vectors = embed(["hello world"])

    assert len(vectors[0]) == 768


def test_embed_returns_unit_length_vectors():
    vectors = embed(["hello world"])

    norm = math.sqrt(sum(x * x for x in vectors[0]))

    assert math.isclose(norm, 1.0, abs_tol=1e-4)


def test_embed_ranks_similar_sentence_above_unrelated_one():
    query, similar, unrelated = embed(
        [
            "What is a vector database?",
            "Zilliz Cloud is a managed vector database service.",
            "The quick brown fox jumps over the lazy dog.",
        ]
    )

    similar_score = sum(q * s for q, s in zip(query, similar, strict=True))
    unrelated_score = sum(q * u for q, u in zip(query, unrelated, strict=True))

    assert similar_score > unrelated_score
