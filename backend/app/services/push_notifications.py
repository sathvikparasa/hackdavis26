from collections import defaultdict
import logging
from typing import Iterable

import httpx
import psycopg

from app.config import get_settings
from app.models import AnalysisResponse, FieldAlert


EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
logger = logging.getLogger(__name__)


def notify_affected_field_owners(
    report_id: str,
    reporter_user_id: str | None,
    analysis: AnalysisResponse,
    alerts: Iterable[FieldAlert],
) -> None:
    _ = reporter_user_id
    alert_by_field_id = {}
    for alert in alerts:
        try:
            alert_by_field_id[int(alert.field_id)] = alert
        except ValueError:
            continue

    if not alert_by_field_id:
        return

    tokens_by_user = _get_push_tokens_for_fields(field_ids=list(alert_by_field_id))
    if not tokens_by_user:
        return

    messages = []
    for _clerk_user_id, rows in tokens_by_user.items():
        highest_alert = max(
            (alert_by_field_id[field_id] for _, field_id, _ in rows),
            key=lambda alert: alert.risk_score,
        )
        field_count = len({field_id for _, field_id, _ in rows})
        crop_names = sorted({crop_type for _, _, crop_type in rows if crop_type})
        crop_label = crop_names[0] if len(crop_names) == 1 else "your crops"
        body = (
            f"{analysis.pest_name} may affect {field_count} of your {crop_label} fields."
            if field_count > 1
            else f"{analysis.pest_name} may affect one of your {crop_label} fields."
        )

        for token in sorted({token for token, _, _ in rows}):
            messages.append(
                {
                    "to": token,
                    "sound": "default",
                    "title": "Pest risk near your field",
                    "body": body,
                    "data": {
                        "reportId": report_id,
                        "fieldId": highest_alert.field_id,
                        "pestName": analysis.pest_name,
                        "severity": highest_alert.severity.value,
                        "screen": "alert-detail",
                    },
                }
            )

    _send_expo_push(messages)


def _get_push_tokens_for_fields(
    field_ids: list[int],
) -> dict[str, list[tuple[str, int, str]]]:
    settings = get_settings()
    if not settings.supabase_db_url:
        return {}

    sql = """
    select distinct
      p.clerk_user_id,
      pt.expo_push_token,
      ff.field_id,
      ff.crop_type
    from public.farmer_fields ff
    join public.profiles p on p.id = ff.profile_id
    join public.push_tokens pt on pt.profile_id = p.id
    where ff.field_id = any(%s)
      and pt.enabled = true;
    """

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (field_ids,))
            rows = cur.fetchall()

    tokens_by_user: dict[str, list[tuple[str, int, str]]] = defaultdict(list)
    for clerk_user_id, token, field_id, crop_type in rows:
        tokens_by_user[clerk_user_id].append((token, int(field_id), crop_type))

    return dict(tokens_by_user)


def _send_expo_push(messages: list[dict]) -> None:
    if not messages:
        return

    settings = get_settings()
    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
    }
    if settings.expo_push_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_push_access_token}"

    try:
        response = httpx.post(EXPO_PUSH_URL, json=messages, headers=headers, timeout=10)
        response.raise_for_status()
    except httpx.HTTPError as error:
        logger.warning("Unable to send Expo push notifications: %s", error)
