import logging

from app.config import get_settings
from app.models import (
    AnalysisResponse,
    RecomputeAllAffectedFieldsResponse,
    RecomputeFarmerFieldsResponse,
    ReportResponse,
    SpreadAnalysis,
    SpreadMethod,
    SpreadRequest,
    SpreadResponse,
    SpreadSource,
)
from app.services.analysis import analyze_report
from app.services.boundary_adjacency import calculate_boundary_adjacency_alerts
from app.services.fields import get_candidate_farmer_fields, get_candidate_fields
from app.services.irrigation import calculate_irrigation_alerts
from app.services.push_notifications import notify_affected_field_owners
from app.services.report_db import (
    delete_all_affected_fields,
    delete_affected_fields_for_fields,
    insert_report,
    list_reports_for_recompute,
    upsert_affected_fields,
)
from app.services.spread import ADJACENCY_HOP_DISTANCE_MILES, calculate_spread
from app.services.storage import upload_report_image


logger = logging.getLogger(__name__)


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

    spread = calculate_report_spread(
        analysis=analysis,
        crop_type=crop_type,
        latitude=latitude,
        longitude=longitude,
        reporter_user_id=reporter_user_id,
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

    try:
        notify_affected_field_owners(
            report_id=report_id,
            reporter_user_id=reporter_user_id,
            analysis=analysis,
            alerts=spread.alerts,
        )
    except Exception as error:
        logger.warning("Unable to send affected field push notifications: %s", error)

    return ReportResponse(
        report_id=report_id,
        image_bucket=settings.supabase_report_image_bucket,
        image_path=image_path,
        analysis=analysis,
        spread=spread,
    )


def recompute_farmer_field_alerts(
    reporter_user_id: str,
    field_id: int | None = None,
    field_ids: list[int] | None = None,
    send_notifications: bool = True,
) -> RecomputeFarmerFieldsResponse:
    filtered_field_ids = set(field_ids or [])
    if field_id is not None:
        filtered_field_ids.add(field_id)

    if filtered_field_ids:
        delete_affected_fields_for_fields(filtered_field_ids)

    reports = list_reports_for_recompute()
    reports_with_alerts = 0
    affected_fields_upserted = 0

    for report in reports:
        spread = calculate_report_spread(
            analysis=report.analysis,
            crop_type=report.crop_type,
            latitude=report.latitude,
            longitude=report.longitude,
            reporter_user_id=reporter_user_id,
        )
        matching_alerts = [
            alert
            for alert in spread.alerts
            if not filtered_field_ids or int(alert.field_id) in filtered_field_ids
        ]
        if not matching_alerts:
            continue

        filtered_spread = SpreadResponse(pest_name=spread.pest_name, alerts=matching_alerts)
        affected_fields_upserted += upsert_affected_fields(
            report_id=report.id,
            spread=filtered_spread,
            field_ids=filtered_field_ids or None,
        )
        reports_with_alerts += 1

        if send_notifications:
            try:
                notify_affected_field_owners(
                    report_id=report.id,
                    reporter_user_id=reporter_user_id,
                    analysis=report.analysis,
                    alerts=matching_alerts,
                )
            except Exception as error:
                logger.warning("Unable to send recomputed push notifications: %s", error)

    return RecomputeFarmerFieldsResponse(
        reporter_user_id=reporter_user_id,
        field_id=field_id,
        field_ids=sorted(filtered_field_ids) or None,
        reports_checked=len(reports),
        reports_with_alerts=reports_with_alerts,
        affected_fields_upserted=affected_fields_upserted,
    )


def repopulate_all_affected_fields() -> RecomputeAllAffectedFieldsResponse:
    deleted_count = delete_all_affected_fields()
    reports = list_reports_for_recompute()
    reports_with_alerts = 0
    affected_fields_upserted = 0

    for report in reports:
        spread = calculate_report_spread(
            analysis=report.analysis,
            crop_type=report.crop_type,
            latitude=report.latitude,
            longitude=report.longitude,
            reporter_user_id=None,
        )
        if not spread.alerts:
            continue

        affected_fields_upserted += upsert_affected_fields(
            report_id=report.id,
            spread=spread,
        )
        reports_with_alerts += 1

    return RecomputeAllAffectedFieldsResponse(
        reports_checked=len(reports),
        reports_with_alerts=reports_with_alerts,
        affected_fields_deleted=deleted_count,
        affected_fields_upserted=affected_fields_upserted,
    )


def calculate_report_spread(
    analysis: AnalysisResponse,
    crop_type: str,
    latitude: float,
    longitude: float,
    reporter_user_id: str | None = None,
) -> SpreadResponse:
    settings = get_settings()
    radius_miles = max(
        analysis.travel_distance,
        settings.candidate_field_radius_miles,
    )
    if reporter_user_id:
        fields = get_candidate_farmer_fields(
            reporter_user_id=reporter_user_id,
            latitude=latitude,
            longitude=longitude,
            radius_miles=radius_miles,
        )
    else:
        fields = get_candidate_fields(
            latitude=latitude,
            longitude=longitude,
            radius_miles=radius_miles,
        )

    spread_source = SpreadSource(
        latitude=latitude,
        longitude=longitude,
        crop_type=crop_type,
    )
    spread_analysis = SpreadAnalysis(
        spread_methods=analysis.spread_methods,
        vulnerable_crop=analysis.vulnerable_crop,
        travel_distance=analysis.travel_distance,
        pest_name=analysis.pest_name,
        confidence=analysis.confidence,
    )

    point_spread = calculate_spread(
        SpreadRequest(
            source=spread_source,
            analysis=SpreadAnalysis(
                spread_methods=[
                    method
                    for method in analysis.spread_methods
                    if method not in {SpreadMethod.adjacency, SpreadMethod.water}
                ],
                vulnerable_crop=spread_analysis.vulnerable_crop,
                travel_distance=spread_analysis.travel_distance,
                pest_name=spread_analysis.pest_name,
                confidence=spread_analysis.confidence,
            ),
            fields=fields,
        )
    )
    if SpreadMethod.adjacency in analysis.spread_methods:
        adjacency_alerts = calculate_boundary_adjacency_alerts(
            source=spread_source,
            vulnerable_crop=analysis.vulnerable_crop,
            confidence=analysis.confidence,
            search_radius_miles=radius_miles,
            hop_distance_miles=ADJACENCY_HOP_DISTANCE_MILES,
            reporter_user_id=reporter_user_id,
        )
    else:
        adjacency_alerts = []

    if SpreadMethod.water in analysis.spread_methods:
        irrigation_alerts = calculate_irrigation_alerts(
            source=spread_source,
            vulnerable_crop=analysis.vulnerable_crop,
            confidence=analysis.confidence,
            search_radius_miles=radius_miles,
            reporter_user_id=reporter_user_id,
        )
    else:
        irrigation_alerts = []

    return SpreadResponse(
        pest_name=point_spread.pest_name,
        alerts=_merge_alerts(point_spread.alerts, adjacency_alerts, irrigation_alerts),
    )


def _merge_alerts(*alert_groups):
    alerts_by_field_id = {}
    for alerts in alert_groups:
        for alert in alerts:
            existing_alert = alerts_by_field_id.get(alert.field_id)
            if existing_alert is None:
                alerts_by_field_id[alert.field_id] = alert
                continue

            existing_methods = list(existing_alert.matched_methods)
            for method in alert.matched_methods:
                if method not in existing_methods:
                    existing_methods.append(method)

            existing_reasons = list(existing_alert.reasons)
            for reason in alert.reasons:
                if reason not in existing_reasons:
                    existing_reasons.append(reason)

            if alert.risk_score > existing_alert.risk_score:
                existing_alert.risk_score = alert.risk_score
                existing_alert.severity = alert.severity
                existing_alert.distance = alert.distance

            existing_alert.matched_methods = existing_methods
            existing_alert.reasons = existing_reasons

    return sorted(
        alerts_by_field_id.values(),
        key=lambda alert: alert.risk_score,
        reverse=True,
    )
