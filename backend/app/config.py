import os
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Settings:
    gemini_api_key: Optional[str] = None
    google_embed_model: str = "gemini-embedding-001"
    google_embed_dimensions: int = 768
    supabase_db_url: Optional[str] = None
    clerk_issuer: Optional[str] = None


def get_settings() -> Settings:
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY"),
        google_embed_model=os.getenv("GOOGLE_EMBED_MODEL", "gemini-embedding-001"),
        google_embed_dimensions=int(os.getenv("GOOGLE_EMBED_DIMENSIONS", "768")),
        supabase_db_url=os.getenv("SUPABASE_DB_URL"),
        clerk_issuer=os.getenv("CLERK_ISSUER"),
    )
