import asyncio
import logging

from app.config import get_settings
from app.models import RecomputeAllAffectedFieldsResponse
from app.services.reports import repopulate_all_affected_fields


logger = logging.getLogger(__name__)
_task: asyncio.Task | None = None
_lock = asyncio.Lock()


async def repopulate_all_affected_fields_once() -> RecomputeAllAffectedFieldsResponse:
    async with _lock:
        return await asyncio.to_thread(repopulate_all_affected_fields)


async def start_affected_fields_scheduler() -> None:
    global _task

    settings = get_settings()
    if not settings.affected_fields_background_repopulate:
        logger.info("Affected-fields background repopulation is disabled")
        return

    if _task and not _task.done():
        return

    _task = asyncio.create_task(
        _scheduler_loop(settings.affected_fields_repopulate_interval_seconds),
        name="affected-fields-repopulate",
    )


async def stop_affected_fields_scheduler() -> None:
    global _task

    if not _task:
        return

    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    finally:
        _task = None


async def _scheduler_loop(interval_seconds: int) -> None:
    interval_seconds = max(interval_seconds, 60)
    while True:
        try:
            result = await repopulate_all_affected_fields_once()
            logger.info(
                "Repopulated affected fields: reports_checked=%s reports_with_alerts=%s deleted=%s upserted=%s",
                result.reports_checked,
                result.reports_with_alerts,
                result.affected_fields_deleted,
                result.affected_fields_upserted,
            )
        except Exception:
            logger.exception("Unable to repopulate affected fields")

        await asyncio.sleep(interval_seconds)
