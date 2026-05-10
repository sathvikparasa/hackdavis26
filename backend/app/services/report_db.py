import json
from dataclasses import dataclass

import psycopg

from app.config import get_settings
from app.models import AnalysisResponse, SpreadMethod, SpreadResponse, VulnerableCrop


@dataclass(frozen=True)
class StoredReport:
    id: str
    pest_name: str
    crop_type: str
    latitude: float
    longitude: float
    analysis: AnalysisResponse


def insert_report(
    reporter_user_id: str | None,
    pest_name: str,
    crop_type: str,
    latitude: float,
    longitude: float,
    image_bucket: str,
    image_path: str,
    analysis: AnalysisResponse,
    spread: SpreadResponse,
) -> str:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    report_sql = """
    insert into public.reports (
      reporter_user_id,
      pest_name,
      crop_type,
      latitude,
      longitude,
      image_bucket,
      image_path,
      confidence,
      travel_distance,
      spread_methods,
      vulnerable_crop
    )
    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::public.spread_method[], %s::jsonb)
    returning id;
    """

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(
                report_sql,
                (
                    reporter_user_id,
                    pest_name,
                    crop_type,
                    latitude,
                    longitude,
                    image_bucket,
                    image_path,
                    analysis.confidence,
                    analysis.travel_distance,
                    [method.value for method in analysis.spread_methods],
                    json.dumps([crop.model_dump() for crop in analysis.vulnerable_crop]),
                ),
            )
            report_id = str(cur.fetchone()[0])

            _upsert_affected_fields(cur, report_id, spread)

        conn.commit()

    return report_id


def list_reports_for_recompute() -> list[StoredReport]:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    sql = """
    select
      id,
      pest_name,
      crop_type,
      latitude,
      longitude,
      confidence,
      travel_distance,
      spread_methods,
      vulnerable_crop
    from public.reports
    where latitude is not null
      and longitude is not null
      and pest_name is not null
    order by created_at desc;
    """

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()

    return [_stored_report_from_row(row) for row in rows]


def upsert_affected_fields(
    report_id: str,
    spread: SpreadResponse,
    field_id: int | None = None,
    field_ids: set[int] | None = None,
) -> int:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    allowed_field_ids = field_ids
    if allowed_field_ids is None and field_id is not None:
        allowed_field_ids = {field_id}

    filtered_alerts = [
        alert
        for alert in spread.alerts
        if allowed_field_ids is None or int(alert.field_id) in allowed_field_ids
    ]
    if not filtered_alerts:
        return 0

    filtered_spread = SpreadResponse(pest_name=spread.pest_name, alerts=filtered_alerts)
    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            _upsert_affected_fields(cur, report_id, filtered_spread)
        conn.commit()

    return len(filtered_alerts)


def delete_affected_fields_for_field(field_id: int) -> int:
    return delete_affected_fields_for_fields({field_id})


def delete_affected_fields_for_fields(field_ids: set[int]) -> int:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")
    if not field_ids:
        return 0

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "delete from public.affected_fields where field_id = any(%s::bigint[]);",
                (list(field_ids),),
            )
            deleted_count = cur.rowcount
        conn.commit()

    return deleted_count


def _upsert_affected_fields(cur, report_id: str, spread: SpreadResponse) -> None:
    affected_field_sql = """
    insert into public.affected_fields (
      report_id,
      field_id,
      risk_score,
      severity,
      distance,
      matched_methods,
      reasons
    )
    values (%s, %s, %s, %s::public.alert_severity, %s, %s::public.spread_method[], %s)
    on conflict (report_id, field_id) do update set
      risk_score = excluded.risk_score,
      severity = excluded.severity,
      distance = excluded.distance,
      matched_methods = excluded.matched_methods,
      reasons = excluded.reasons;
    """

    for alert in spread.alerts:
        cur.execute(
            affected_field_sql,
            (
                report_id,
                int(alert.field_id),
                alert.risk_score,
                alert.severity.value,
                alert.distance,
                [method.value for method in alert.matched_methods],
                alert.reasons,
            ),
        )


def _stored_report_from_row(row) -> StoredReport:
    vulnerable_crop = row[8]
    if isinstance(vulnerable_crop, str):
        vulnerable_crop = json.loads(vulnerable_crop)
    vulnerable_crop = vulnerable_crop or []

    return StoredReport(
        id=str(row[0]),
        pest_name=row[1],
        crop_type=row[2] or "unknown",
        latitude=float(row[3]),
        longitude=float(row[4]),
        analysis=AnalysisResponse(
            spread_methods=[SpreadMethod(method) for method in row[7] or []],
            vulnerable_crop=[VulnerableCrop(**crop) for crop in vulnerable_crop],
            travel_distance=float(row[6] or 0),
            pest_name=row[1],
            confidence=float(row[5] or 0),
        ),
    )
