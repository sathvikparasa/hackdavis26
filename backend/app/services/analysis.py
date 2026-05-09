from typing import Optional

from app.models import AnalysisResponse
from app.services.gemini import identify_pest, synthesize_analysis


def analyze_report(
    image_bytes: bytes,
    mime_type: str,
    crop_type: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> AnalysisResponse:
    pest = identify_pest(
        image_bytes=image_bytes,
        mime_type=mime_type,
        crop_type=crop_type,
    )

    return synthesize_analysis(
        pest_name=pest.pest_name,
        crop_type=crop_type,
        identification_confidence=pest.confidence,
        latitude=latitude,
        longitude=longitude,
    )
