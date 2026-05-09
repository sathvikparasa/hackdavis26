import json

import psycopg

from app.config import get_settings
from app.models import AnalysisResponse, SpreadResponse


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

        conn.commit()

    return report_id
