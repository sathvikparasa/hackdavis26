import json
from dataclasses import dataclass

import psycopg

from app.config import get_settings
from app.models import AlertSeverity, AnalysisResponse, FieldAlert, SpreadMethod, SpreadResponse, VulnerableCrop


@dataclass(frozen=True)
class StoredReport:
    id: str
    pest_name: str
    crop_type: str
    latitude: float
    longitude: float
    analysis: AnalysisResponse


@dataclass(frozen=True)
class ExistingAffectedReport:
    id: str
    reporter_user_id: str | None
    analysis: AnalysisResponse
    alerts: list[FieldAlert]


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


def list_farmer_field_owner_user_ids() -> list[str]:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    sql = """
    select distinct p.clerk_user_id
    from public.farmer_fields ff
    join public.profiles p on p.id = ff.profile_id
    where p.clerk_user_id is not null
      and nullif(trim(ff.crop_type), '') is not null
    order by p.clerk_user_id;
    """

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()

    return [str(row[0]) for row in rows]


def list_farmer_field_ids_for_user(reporter_user_id: str) -> list[int]:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    sql = """
    select distinct ff.field_id
    from public.farmer_fields ff
    join public.profiles p on p.id = ff.profile_id
    where p.clerk_user_id = %(reporter_user_id)s
    order by ff.field_id;
    """

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"reporter_user_id": reporter_user_id})
            rows = cur.fetchall()

    return [int(row[0]) for row in rows]



def list_existing_affected_reports(
    reporter_user_id: str | None = None,
    report_id: str | None = None,
    field_ids: set[int] | None = None,
) -> list[ExistingAffectedReport]:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    sql = """
    select
      r.id,
      r.reporter_user_id,
      r.pest_name,
      r.confidence,
      r.travel_distance,
      r.spread_methods,
      r.vulnerable_crop,
      af.field_id,
      coalesce(f.unique_id, 'field_' || f.id::text) as field_name,
      coalesce(nullif(ff.crop_type, ''), nullif(f.main_crop_name, ''), f.main_crop, 'unknown') as crop_type,
      af.risk_score,
      af.severity,
      af.distance,
      af.matched_methods,
      af.reasons
    from public.affected_fields af
    join public.reports r on r.id = af.report_id
    join public.fields f on f.id = af.field_id
    join public.farmer_fields ff on ff.field_id = af.field_id
    where (%(reporter_user_id)s::text is null or r.reporter_user_id = %(reporter_user_id)s::text)
      and (%(report_id)s::uuid is null or r.id = %(report_id)s::uuid)
      and (%(field_ids)s::bigint[] is null or af.field_id = any(%(field_ids)s::bigint[]))
    order by r.created_at desc, af.risk_score desc;
    """

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "reporter_user_id": reporter_user_id,
                    "report_id": report_id,
                    "field_ids": list(field_ids) if field_ids else None,
                },
            )
            rows = cur.fetchall()

    by_report: dict[str, ExistingAffectedReport] = {}
    for row in rows:
        report_id_value = str(row[0])
        report = by_report.get(report_id_value)
        if report is None:
            report = ExistingAffectedReport(
                id=report_id_value,
                reporter_user_id=row[1],
                analysis=_analysis_from_report_columns(
                    pest_name=row[2],
                    confidence=row[3],
                    travel_distance=row[4],
                    spread_methods=row[5],
                    vulnerable_crop=row[6],
                ),
                alerts=[],
            )
            by_report[report_id_value] = report

        report.alerts.append(
            FieldAlert(
                field_id=str(row[7]),
                field_name=row[8],
                crop_type=row[9] or "unknown",
                risk_score=float(row[10] or 0),
                severity=AlertSeverity(row[11]),
                distance=float(row[12] or 0),
                matched_methods=_spread_methods_from_db(row[13]),
                reasons=_reasons_from_db(row[14]),
            )
        )

    return list(by_report.values())


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


def delete_all_affected_fields() -> int:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute("delete from public.affected_fields;")
            deleted_count = cur.rowcount
        conn.commit()

    return deleted_count


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
    analysis = _analysis_from_report_columns(
        pest_name=row[1],
        confidence=row[5],
        travel_distance=row[6],
        spread_methods=row[7],
        vulnerable_crop=row[8],
    )

    return StoredReport(
        id=str(row[0]),
        pest_name=row[1],
        crop_type=row[2] or "unknown",
        latitude=float(row[3]),
        longitude=float(row[4]),
        analysis=analysis,
    )


def _analysis_from_report_columns(
    pest_name: str,
    confidence,
    travel_distance,
    spread_methods,
    vulnerable_crop,
) -> AnalysisResponse:
    if isinstance(vulnerable_crop, str):
        vulnerable_crop = json.loads(vulnerable_crop)
    vulnerable_crop = vulnerable_crop or []

    return AnalysisResponse(
        spread_methods=_spread_methods_from_db(spread_methods),
        vulnerable_crop=[VulnerableCrop(**crop) for crop in vulnerable_crop],
        travel_distance=float(travel_distance or 0),
        pest_name=pest_name,
        confidence=float(confidence or 0),
    )


def _spread_methods_from_db(value) -> list[SpreadMethod]:
    if value is None:
        return []

    if isinstance(value, str):
        value = value.strip()
        if value.startswith("{") and value.endswith("}"):
            value = [item.strip().strip('"') for item in value[1:-1].split(",") if item.strip()]
        else:
            value = [value]

    return [SpreadMethod(method) for method in value]


def _reasons_from_db(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return [str(item) for item in parsed] if isinstance(parsed, list) else [value]
        except json.JSONDecodeError:
            return [value]
    return [str(item) for item in value]
