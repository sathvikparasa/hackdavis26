import logging
import time
from typing import Optional

from app.models import AnalysisResponse
from app.services.gemini import identify_pest, synthesize_analysis


logger = logging.getLogger("yologuard.timing")


def analyze_report(
    image_bytes: bytes,
    mime_type: str,
    crop_type: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> AnalysisResponse:
    started = time.perf_counter()

    pest_started = time.perf_counter()
    pest = identify_pest(
        image_bytes=image_bytes,
        mime_type=mime_type,
        crop_type=crop_type,
    )
    logger.info(
        "analysis stage=identify_pest pest=%s confidence=%.3f duration_ms=%.1f",
        pest.pest_name,
        pest.confidence,
        (time.perf_counter() - pest_started) * 1000,
    )

    synthesis_started = time.perf_counter()
    analysis = synthesize_analysis(
        pest_name=pest.pest_name,
        crop_type=crop_type,
        identification_confidence=pest.confidence,
        latitude=latitude,
        longitude=longitude,
    )
    logger.info(
        "analysis stage=synthesize_analysis pest=%s duration_ms=%.1f",
        analysis.pest_name,
        (time.perf_counter() - synthesis_started) * 1000,
    )
    logger.info("analysis total_duration_ms=%.1f", (time.perf_counter() - started) * 1000)
    return analysis
