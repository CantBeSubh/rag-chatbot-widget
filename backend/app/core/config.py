from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SCHEMA: str = "public"

    ZILLIZ_URI: str = ""
    ZILLIZ_TOKEN: str = ""
    DEFAULT_COLLECTION_NAME: str = "tenant_default"

    REDIS_URL: str = "redis://admin:admin@localhost:6379"

    LANGCHAIN_OLLAMA_BASE_URL: str = "http://localhost:11434"
    LANGCHAIN_OLLAMA_MODEL: str = "llama3.1:8b"

    HF_TOKEN: str = ""
    LANGCHAIN_HUGGINGFACE_MODEL: str = "zai-org/GLM-5.2"

    SECRET_KEY: str = ""
    ENVIRONMENT: str = "development"


settings = Settings()
