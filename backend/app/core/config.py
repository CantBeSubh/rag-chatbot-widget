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

    GROQ_API_KEY: str = ""
    LANGCHAIN_GROQ_MODEL: str = "llama-3.3-70b-versatile"

    CEREBRAS_API_KEY: str = ""
    LANGCHAIN_CEREBRAS_MODEL: str = "gpt-oss-120b"

    OPENROUTER_API_KEY: str = ""
    LANGCHAIN_OPENROUTER_MODEL: str = "openai/gpt-oss-20b:free"

    GOOGLE_API_KEY: str = ""
    LANGCHAIN_GOOGLE_MODEL: str = "gemini-2.5-flash-lite"

    SECRET_KEY: str = ""
    ENVIRONMENT: str = "development"
    SENTRY_DSN: str = ""


settings = Settings()
