from app.config import get_settings
from app.models import (
    ReportResponse,
    SpreadAnalysis,
    SpreadRequest,
    SpreadSource,
)
from app.services.analysis import analyze_report
from app.services.fields import get_candidate_fields
from app.services.report_db import insert_report
from app.services.spread import calculate_spread
from app.services.storage import upload_report_image


def submit_report(
    image_bytes: bytes,
    mime_type: str,
    filename: str,
    crop_type: str,
    latitude: float,
    longitude: float,
    reporter_user_id: str | None = None,
) -> ReportResponse:
    settings = get_settings()
    image_path = upload_report_image(
        image_bytes=image_bytes,
        mime_type=mime_type,
        filename=filename,
    )

    analysis = analyze_report(
        image_bytes=image_bytes,
        mime_type=mime_type,
        crop_type=crop_type,
        latitude=latitude,
        longitude=longitude,
    )

    fields = get_candidate_fields(
        latitude=latitude,
        longitude=longitude,
        radius_miles=max(
            analysis.travel_distance,
            settings.candidate_field_radius_miles,
        ),
    )

    spread = calculate_spread(
        SpreadRequest(
            source=SpreadSource(
                latitude=latitude,
                longitude=longitude,
                crop_type=crop_type,
            ),
            analysis=SpreadAnalysis(
                spread_methods=analysis.spread_methods,
                vulnerable_crop=analysis.vulnerable_crop,
                travel_distance=analysis.travel_distance,
                pest_name=analysis.pest_name,
                confidence=analysis.confidence,
            ),
            fields=fields,
        )
    )

    report_id = insert_report(
        reporter_user_id=reporter_user_id,
        pest_name=analysis.pest_name,
        crop_type=crop_type,
        latitude=latitude,
        longitude=longitude,
        image_bucket=settings.supabase_report_image_bucket,
        image_path=image_path,
        analysis=analysis,
        spread=spread,
    )

    return ReportResponse(
        report_id=report_id,
        image_bucket=settings.supabase_report_image_bucket,
        image_path=image_path,
        analysis=analysis,
        spread=spread,
    )
