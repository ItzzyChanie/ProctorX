from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    internal_api_key: str = "development-internal-key"
    redis_url: str = "redis://localhost:6379/0"
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_provider: str = "gemini"
    gemini_api_key: str | None = None
    max_document_size_mb: int = 20
    max_document_characters: int = 100_000
    max_generated_questions: int = 50
    question_generation_timeout_seconds: int = 120
    libreoffice_path: str = r"C:\Program Files\LibreOffice\program\soffice.exe"
    libreoffice_conversion_timeout_seconds: int = 60
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore"
    )

settings = Settings()
