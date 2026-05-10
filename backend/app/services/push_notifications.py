from collections import defaultdict
from dataclasses import dataclass, field
import logging
from typing import Iterable

import httpx
import psycopg

from app.config import get_settings
from app.models import AnalysisResponse, FieldAlert


EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
logger = logging.getLogger(__name__)


@dataclass
class PushNotificationResult:
    affected_fields_requested: int = 0
    recipient_users_found: int = 0
    push_tokens_found: int = 0
    push_messages_attempted: int = 0
    push_tickets_ok: int = 0
    push_tickets_error: int = 0
    push_errors: list[str] = field(default_factory=list)

    def merge(self, other: "PushNotificationResult") -> None:
        self.affected_fields_requested += other.affected_fields_requested
        self.recipient_users_found += other.recipient_users_found
        self.push_tokens_found += other.push_tokens_found
        self.push_messages_attempted += other.push_messages_attempted
        self.push_tickets_ok += other.push_tickets_ok
        self.push_tickets_error += other.push_tickets_error
        self.push_errors.extend(other.push_errors)


def notify_affected_field_owners(
    report_id: str,
    reporter_user_id: str | None,
    analysis: AnalysisResponse,
    alerts: Iterable[FieldAlert],
) -> PushNotificationResult:
    _ = reporter_user_id
    alert_by_field_id = {}
    for alert in alerts:
        try:
            alert_by_field_id[int(alert.field_id)] = alert
        except ValueError:
            continue

    result = PushNotificationResult(affected_fields_requested=len(alert_by_field_id))
    if not alert_by_field_id:
        return result

    tokens_by_user = _get_push_tokens_for_fields(field_ids=list(alert_by_field_id))
    result.recipient_users_found = len(tokens_by_user)
    result.push_tokens_found = len(
        {token for rows in tokens_by_user.values() for token, _, _ in rows}
    )
    if not tokens_by_user:
        result.push_errors.append("No enabled Expo push tokens found for affected fields.")
        logger.info(
            "No enabled Expo push tokens found for affected field_ids=%s",
            sorted(alert_by_field_id),
        )
        return result

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

    result.push_messages_attempted = len(messages)
    send_result = _send_expo_push(messages)
    result.merge(send_result)
    return result


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


def _send_expo_push(messages: list[dict]) -> PushNotificationResult:
    result = PushNotificationResult()
    if not messages:
        return result

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
        message = f"Unable to send Expo push notifications: {error}"
        result.push_errors.append(message)
        logger.warning(message)
        return result

    try:
        payload = response.json()
    except ValueError:
        result.push_tickets_error = len(messages)
        result.push_errors.append("Expo push response was not valid JSON.")
        logger.warning("Expo push response was not valid JSON: %s", response.text)
        return result

    tickets = payload.get("data", [])
    if isinstance(tickets, dict):
        tickets = [tickets]
    if not isinstance(tickets, list):
        tickets = []

    for index, ticket in enumerate(tickets):
        if not isinstance(ticket, dict):
            result.push_tickets_error += 1
            result.push_errors.append(f"Expo push ticket {index} had an unexpected shape.")
            continue

        status = ticket.get("status")
        if status == "ok":
            result.push_tickets_ok += 1
            continue

        result.push_tickets_error += 1
        error_message = ticket.get("message") or ticket.get("error") or "Unknown Expo push error"
        details = ticket.get("details")
        if details:
            error_message = f"{error_message} ({details})"
        result.push_errors.append(str(error_message))

    unreported_ticket_count = len(messages) - len(tickets)
    if unreported_ticket_count > 0:
        result.push_tickets_error += unreported_ticket_count
        result.push_errors.append(
            f"Expo did not return tickets for {unreported_ticket_count} push message(s)."
        )

    top_level_errors = payload.get("errors", [])
    if isinstance(top_level_errors, list):
        for error in top_level_errors:
            result.push_errors.append(str(error))

    if result.push_tickets_error or result.push_errors:
        logger.warning(
            "Expo push returned ok=%s error=%s errors=%s",
            result.push_tickets_ok,
            result.push_tickets_error,
            result.push_errors,
        )

    return result
