from pathlib import Path
from uuid import uuid4

import httpx

from app.config import get_settings


def upload_report_image(
    image_bytes: bytes,
    mime_type: str,
    filename: str,
) -> str:
    settings = get_settings()
    if not settings.supabase_url:
        raise RuntimeError("Missing SUPABASE_URL")
    if not settings.supabase_secret_key:
        raise RuntimeError("Missing SUPABASE_SECRET_KEY")

    image_path = _build_image_path(filename)
    url = (
        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/"
        f"{settings.supabase_report_image_bucket}/{image_path}"
    )
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
        "Content-Type": mime_type,
        "x-upsert": "false",
    }

    response = httpx.post(url, content=image_bytes, headers=headers, timeout=30)
    response.raise_for_status()
    return image_path


def _build_image_path(filename: str) -> str:
    suffix = Path(filename).suffix.lower() or ".jpg"
    return f"reports/{uuid4()}{suffix}"
