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
    gemini_vision_model: str = "gemini-3-flash-preview"
    gemini_analysis_model: str = "gemini-3-flash-preview"
    google_embed_model: str = "gemini-embedding-001"
    google_embed_dimensions: int = 768
    ipm_match_count: int = 5
    candidate_field_radius_miles: float = 10
    supabase_db_url: Optional[str] = None
    supabase_url: Optional[str] = None
    supabase_secret_key: Optional[str] = None
    supabase_report_image_bucket: str = "report-images"
    clerk_issuer: Optional[str] = None


def get_settings() -> Settings:
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY"),
        gemini_vision_model=os.getenv("GEMINI_VISION_MODEL", "gemini-3-flash-preview"),
        gemini_analysis_model=os.getenv("GEMINI_ANALYSIS_MODEL", "gemini-3-flash-preview"),
        google_embed_model=os.getenv("GOOGLE_EMBED_MODEL", "gemini-embedding-001"),
        google_embed_dimensions=int(os.getenv("GOOGLE_EMBED_DIMENSIONS", "768")),
        ipm_match_count=int(os.getenv("IPM_MATCH_COUNT", "5")),
        candidate_field_radius_miles=float(os.getenv("CANDIDATE_FIELD_RADIUS_MILES", "10")),
        supabase_db_url=os.getenv("SUPABASE_DB_URL"),
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_secret_key=os.getenv("SUPABASE_SECRET_KEY"),
        supabase_report_image_bucket=os.getenv("SUPABASE_REPORT_IMAGE_BUCKET", "report-images"),
        clerk_issuer=os.getenv("CLERK_ISSUER"),
    )
