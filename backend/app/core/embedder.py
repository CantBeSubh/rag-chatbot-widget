from sentence_transformers import SentenceTransformer

MODEL_NAME = "BAAI/bge-base-en-v1.5"  # 768-dim output; must match Zilliz dim

_model = SentenceTransformer(MODEL_NAME)


def embed(texts: list[str]) -> list[list[float]]:
    embeddings = _model.encode(texts, normalize_embeddings=True)
    return embeddings.tolist()
