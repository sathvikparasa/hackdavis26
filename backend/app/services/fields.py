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
    with field_points as (
      select
        id,
        coalesce(unique_id, 'field_' || id::text) as name,
        coalesce(main_crop, 'unknown') as crop_type,
        coalesce(
          case
            when label_point ? 'longitude' and label_point ? 'latitude'
            then st_setsrid(
              st_makepoint(
                (label_point->>'longitude')::double precision,
                (label_point->>'latitude')::double precision
              ),
              4326
            )
          end,
          st_setsrid(st_pointonsurface(geometry), 4326)
        ) as point
      from public.fields
      where geometry is not null
        or (label_point ? 'longitude' and label_point ? 'latitude')
    )
    select
      id::text,
      name,
      crop_type,
      st_y(point) as latitude,
      st_x(point) as longitude
    from field_points
    where point is not null
      and st_dwithin(
        st_setsrid(st_makepoint(%s, %s), 4326)::geography,
        point::geography,
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


def get_candidate_farmer_fields(
    reporter_user_id: str,
    latitude: float,
    longitude: float,
    radius_miles: float,
) -> list[CandidateField]:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    sql = """
    with field_points as (
      select
        f.id,
        coalesce(f.unique_id, 'field_' || f.id::text) as name,
        ff.crop_type,
        coalesce(
          case
            when f.label_point ? 'longitude' and f.label_point ? 'latitude'
            then st_setsrid(
              st_makepoint(
                (f.label_point->>'longitude')::double precision,
                (f.label_point->>'latitude')::double precision
              ),
              4326
            )
          end,
          st_setsrid(st_pointonsurface(f.geometry), 4326)
        ) as point
      from public.farmer_fields ff
      join public.profiles p on p.id = ff.profile_id
      join public.fields f on f.id = ff.field_id
      where p.clerk_user_id = %s
        and nullif(trim(ff.crop_type), '') is not null
        and (
          f.geometry is not null
          or (f.label_point ? 'longitude' and f.label_point ? 'latitude')
        )
    )
    select
      id::text,
      name,
      crop_type,
      st_y(point) as latitude,
      st_x(point) as longitude
    from field_points
    where point is not null
      and st_dwithin(
        st_setsrid(st_makepoint(%s, %s), 4326)::geography,
        point::geography,
        %s
      );
    """

    radius_meters = max(radius_miles, 0) * METERS_PER_MILE

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (reporter_user_id, longitude, latitude, radius_meters))
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
