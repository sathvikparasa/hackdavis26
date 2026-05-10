import logging

from app.config import get_settings
from app.models import (
    AnalysisResponse,
    FieldAlert,
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
from app.services.fields import get_candidate_farmer_fields, get_candidate_fields
from app.services.irrigation import calculate_irrigation_alerts
from app.services.push_notifications import notify_affected_field_owners
from app.services.report_db import (
    delete_all_affected_fields,
    delete_affected_fields_for_fields,
    list_farmer_field_owner_user_ids,
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

    populate_and_notify_report_alerts(
        report_id=report_id,
        analysis=analysis,
        crop_type=crop_type,
        latitude=latitude,
        longitude=longitude,
        reporter_user_id=reporter_user_id,
    )

    return ReportResponse(
        report_id=report_id,
        image_bucket=settings.supabase_report_image_bucket,
        image_path=image_path,
        analysis=analysis,
        spread=spread,
    )


def populate_and_notify_report_alerts(
    report_id: str,
    analysis: AnalysisResponse,
    crop_type: str,
    latitude: float,
    longitude: float,
    reporter_user_id: str | None = None,
) -> int:
    farmer_user_ids = list_farmer_field_owner_user_ids()
    notified_field_ids: set[int] = set()
    affected_fields_upserted = 0

    logger.info(
        "Populating report alerts for notification report_id=%s farmer_owner_count=%s",
        report_id,
        len(farmer_user_ids),
    )

    for farmer_user_id in farmer_user_ids:
        spread = calculate_report_spread(
            analysis=analysis,
            crop_type=crop_type,
            latitude=latitude,
            longitude=longitude,
            reporter_user_id=farmer_user_id,
        )
        if not spread.alerts:
            continue

        upserted_count = upsert_affected_fields(report_id=report_id, spread=spread)
        affected_fields_upserted += upserted_count

        notification_alerts = _alerts_not_already_notified(spread.alerts, notified_field_ids)
        if not notification_alerts:
            continue

        try:
            notify_affected_field_owners(
                report_id=report_id,
                reporter_user_id=reporter_user_id,
                analysis=analysis,
                alerts=notification_alerts,
            )
        except Exception as error:
            logger.warning("Unable to send affected field push notifications: %s", error)

    logger.info(
        "Finished report alert notifications report_id=%s upserted=%s notified_fields=%s",
        report_id,
        affected_fields_upserted,
        len(notified_field_ids),
    )

    return affected_fields_upserted


def _alerts_not_already_notified(alerts: list[FieldAlert], notified_field_ids: set[int]) -> list[FieldAlert]:
    next_alerts: list[FieldAlert] = []
    for alert in alerts:
        try:
            field_id = int(alert.field_id)
        except ValueError:
            continue
        if field_id in notified_field_ids:
            continue
        notified_field_ids.add(field_id)
        next_alerts.append(alert)

    return next_alerts


def recompute_farmer_field_alerts(
    reporter_user_id: str,
    field_id: int | None = None,
    field_ids: list[int] | None = None,
    send_notifications: bool = True,
) -> RecomputeFarmerFieldsResponse:
    filtered_field_ids = set(field_ids or [])
    if field_id is not None:
        filtered_field_ids.add(field_id)

    logger.info(
        "Starting farmer field alert recompute reporter_user_id=%s filtered_field_ids=%s send_notifications=%s",
        reporter_user_id,
        sorted(filtered_field_ids) or None,
        send_notifications,
    )

    if filtered_field_ids:
        delete_affected_fields_for_fields(filtered_field_ids)
        logger.info("Deleted affected fields for field_ids=%s", sorted(filtered_field_ids))

    reports = list_reports_for_recompute()
    logger.info("Loaded %s report(s) for farmer field recompute", len(reports))
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
            logger.info("Report %s produced no matching farmer field alert(s)", report.id)
            continue

        filtered_spread = SpreadResponse(pest_name=spread.pest_name, alerts=matching_alerts)
        upserted_count = upsert_affected_fields(
            report_id=report.id,
            spread=filtered_spread,
            field_ids=filtered_field_ids or None,
        )
        affected_fields_upserted += upserted_count
        reports_with_alerts += 1
        logger.info(
            "Report %s upserted %s affected farmer field(s)",
            report.id,
            upserted_count,
        )

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

    logger.info(
        "Finished farmer field alert recompute reports_checked=%s reports_with_alerts=%s upserted=%s",
        len(reports),
        reports_with_alerts,
        affected_fields_upserted,
    )

    return RecomputeFarmerFieldsResponse(
        reporter_user_id=reporter_user_id,
        field_id=field_id,
        field_ids=sorted(filtered_field_ids) or None,
        reports_checked=len(reports),
        reports_with_alerts=reports_with_alerts,
        affected_fields_upserted=affected_fields_upserted,
    )


def repopulate_all_affected_fields() -> RecomputeAllAffectedFieldsResponse:
    logger.info("Starting full affected fields repopulation")
    deleted_count = delete_all_affected_fields()
    logger.info("Deleted %s existing affected field row(s)", deleted_count)
    reports = list_reports_for_recompute()
    logger.info("Loaded %s report(s) for full affected fields repopulation", len(reports))
    farmer_user_ids = list_farmer_field_owner_user_ids()
    logger.info(
        "Loaded %s farmer field owner(s) for full affected fields repopulation",
        len(farmer_user_ids),
    )
    reports_with_alerts = 0
    affected_fields_upserted = 0

    for report in reports:
        report_upserted_count = 0
        for farmer_user_id in farmer_user_ids:
            spread = calculate_report_spread(
                analysis=report.analysis,
                crop_type=report.crop_type,
                latitude=report.latitude,
                longitude=report.longitude,
                reporter_user_id=farmer_user_id,
            )
            if not spread.alerts:
                continue

            upserted_count = upsert_affected_fields(
                report_id=report.id,
                spread=spread,
            )
            report_upserted_count += upserted_count
            affected_fields_upserted += upserted_count
            logger.info(
                "Report %s upserted %s affected field(s) for farmer_user_id=%s",
                report.id,
                upserted_count,
                farmer_user_id,
            )

        if report_upserted_count == 0:
            logger.info("Report %s produced no affected field alert(s)", report.id)
            continue

        reports_with_alerts += 1
        logger.info(
            "Report %s upserted %s total affected farmer field(s)",
            report.id,
            report_upserted_count,
        )

    logger.info(
        "Finished full affected fields repopulation reports_checked=%s reports_with_alerts=%s deleted=%s upserted=%s",
        len(reports),
        reports_with_alerts,
        deleted_count,
        affected_fields_upserted,
    )

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
    logger.info(
        "Calculating report spread pest=%s crop=%s methods=%s radius_miles=%s reporter_scoped=%s",
        analysis.pest_name,
        crop_type,
        [method.value for method in analysis.spread_methods],
        radius_miles,
        bool(reporter_user_id),
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

    logger.info("Loaded %s candidate field(s) for report spread", len(fields))
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
                    if method != SpreadMethod.water
                ],
                vulnerable_crop=spread_analysis.vulnerable_crop,
                travel_distance=spread_analysis.travel_distance,
                pest_name=spread_analysis.pest_name,
                confidence=spread_analysis.confidence,
            ),
            fields=fields,
        )
    )
    logger.info("Point spread produced %s alert(s)", len(point_spread.alerts))
    adjacency_alerts = []
    if SpreadMethod.adjacency in analysis.spread_methods:
        logger.info(
            "Adjacency spread used center-based candidate fields with hop_miles=%s",
            ADJACENCY_HOP_DISTANCE_MILES,
        )

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
    logger.info("Irrigation spread produced %s alert(s)", len(irrigation_alerts))

    merged_alerts = _merge_alerts(point_spread.alerts, adjacency_alerts, irrigation_alerts)
    logger.info("Merged report spread produced %s alert(s)", len(merged_alerts))
    return SpreadResponse(
        pest_name=point_spread.pest_name,
        alerts=merged_alerts,
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
