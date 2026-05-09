import psycopg

from app.config import get_settings
from app.models import CandidateField


METERS_PER_MILE = 1609.344


def get_candidate_fields(
    latitude: float,
    longitude: float,
    radius_miles: float,
) -> list[CandidateField]:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    sql = """
    select
      id::text,
      coalesce(unique_id, 'field_' || id::text) as name,
      coalesce(main_crop, 'unknown') as crop_type,
      st_y(st_pointonsurface(geometry)) as latitude,
      st_x(st_pointonsurface(geometry)) as longitude
    from public.fields
    where geometry is not null
      and st_dwithin(
        st_setsrid(st_makepoint(%s, %s), 4326)::geography,
        st_setsrid(st_pointonsurface(geometry), 4326)::geography,
        %s
      );
    """

    radius_meters = max(radius_miles, 0) * METERS_PER_MILE

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (longitude, latitude, radius_meters))
            rows = cur.fetchall()

    return [
        CandidateField(
            id=row[0],
            name=row[1],
            crop_type=row[2],
            latitude=float(row[3]),
            longitude=float(row[4]),
        )
        for row in rows
    ]
