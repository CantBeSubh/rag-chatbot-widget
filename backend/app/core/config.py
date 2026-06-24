from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    SUPABASE_URL: str
    SUPABASE_KEY: str

    ZILLIZ_URI: str = ""
    ZILLIZ_TOKEN: str = ""

    REDIS_URL: str = "redis://localhost:6379"

    SECRET_KEY: str = ""
    ENVIRONMENT: str = "development"


settings = Settings()
