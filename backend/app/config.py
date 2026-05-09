import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    gemini_api_key: Optional[str] = None
    gemini_vision_model: str = "gemini-2.5-flash"
    gemini_analysis_model: str = "gemini-2.5-flash"
    google_embed_model: str = "gemini-embedding-001"
    google_embed_dimensions: int = 768
    ipm_match_count: int = 5
    supabase_db_url: Optional[str] = None
    clerk_issuer: Optional[str] = None


def get_settings() -> Settings:
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY"),
        gemini_vision_model=os.getenv("GEMINI_VISION_MODEL", "gemini-2.5-flash"),
        gemini_analysis_model=os.getenv("GEMINI_ANALYSIS_MODEL", "gemini-2.5-flash"),
        google_embed_model=os.getenv("GOOGLE_EMBED_MODEL", "gemini-embedding-001"),
        google_embed_dimensions=int(os.getenv("GOOGLE_EMBED_DIMENSIONS", "768")),
        ipm_match_count=int(os.getenv("IPM_MATCH_COUNT", "5")),
        supabase_db_url=os.getenv("SUPABASE_DB_URL"),
        clerk_issuer=os.getenv("CLERK_ISSUER"),
    )
