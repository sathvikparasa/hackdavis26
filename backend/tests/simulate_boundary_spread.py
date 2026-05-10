import argparse
import json
import sys
import time
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402


METERS_PER_MILE = 1609.344
DEGREES_PER_MILE = 1 / 69


def _crop_keys(crops: list[str]) -> list[str]:
    keys = set()
    for crop in crops:
        normalized = " ".join("".join(char if char.isalnum() else " " for char in crop.lower()).split())
        if normalized:
            keys.add(normalized)
            if len(normalized) > 3 and normalized.endswith("s"):
                keys.add(normalized[:-1])
            else:
                keys.add(f"{normalized}s")
    return sorted(keys)


def _scope_sql(scope: str) -> str:
    if scope == "all":
        return """
        select
          f.id,
          coalesce(f.unique_id, 'field_' || f.id::text) as name,
          coalesce(f.main_crop, 'unknown') as crop_type,
          case
            when length(trim(regexp_replace(lower(coalesce(f.main_crop, 'unknown')), '[^a-z0-9]+', ' ', 'g'))) > 3
             and trim(regexp_replace(lower(coalesce(f.main_crop, 'unknown')), '[^a-z0-9]+', ' ', 'g')) like '%%s'
            then left(
              trim(regexp_replace(lower(coalesce(f.main_crop, 'unknown')), '[^a-z0-9]+', ' ', 'g')),
              length(trim(regexp_replace(lower(coalesce(f.main_crop, 'unknown')), '[^a-z0-9]+', ' ', 'g'))) - 1
            )
            else trim(regexp_replace(lower(coalesce(f.main_crop, 'unknown')), '[^a-z0-9]+', ' ', 'g'))
          end as crop_key,
          f.geometry
        from public.fields f
        where f.geometry is not null
        """

    return """
    select
      f.id,
      coalesce(f.unique_id, 'field_' || f.id::text) as name,
      ff.crop_type,
      case
        when length(trim(regexp_replace(lower(ff.crop_type), '[^a-z0-9]+', ' ', 'g'))) > 3
         and trim(regexp_replace(lower(ff.crop_type), '[^a-z0-9]+', ' ', 'g')) like '%%s'
        then left(
          trim(regexp_replace(lower(ff.crop_type), '[^a-z0-9]+', ' ', 'g')),
          length(trim(regexp_replace(lower(ff.crop_type), '[^a-z0-9]+', ' ', 'g'))) - 1
        )
        else trim(regexp_replace(lower(ff.crop_type), '[^a-z0-9]+', ' ', 'g'))
      end as crop_key,
      f.geometry
    from public.farmer_fields ff
    join public.profiles p on p.id = ff.profile_id
    join public.fields f on f.id = ff.field_id
    where p.clerk_user_id = %(reporter_user_id)s
      and nullif(trim(ff.crop_type), '') is not null
      and f.geometry is not null
    """


def run_simulation(
    reporter_user_id: str | None,
    latitude: float,
    longitude: float,
    search_radius_miles: float,
    hop_distance_miles: float,
    vulnerable_crops: list[str],
    scope: str = "saved",
    ignore_crop_filter: bool = False,
) -> dict:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    search_meters = search_radius_miles * METERS_PER_MILE
    hop_meters = hop_distance_miles * METERS_PER_MILE
    search_degrees = search_radius_miles * DEGREES_PER_MILE
    hop_degrees = hop_distance_miles * DEGREES_PER_MILE
    crop_keys = _crop_keys(vulnerable_crops)
    scope_sql = _scope_sql(scope)
    crop_filter_sql = "true" if ignore_crop_filter else "sf.crop_key = any(%(crop_keys)s)"

    sql = f"""
    with recursive
    source as (
      select st_setsrid(st_makepoint(%(longitude)s, %(latitude)s), 4326) as point
    ),
    scoped_fields as materialized (
      {scope_sql}
    ),
    candidates as materialized (
      select sf.*
      from scoped_fields sf
      cross join source s
      where {crop_filter_sql}
        and sf.geometry && st_expand(s.point, %(search_degrees)s)
        and st_dwithin(sf.geometry::geography, s.point::geography, %(search_meters)s)
    ),
    reached as (
      select
        c.id,
        c.name,
        c.crop_type,
        c.geometry,
        1 as hops,
        st_distance(c.geometry::geography, s.point::geography) / %(meters_per_mile)s
          as trigger_distance_miles,
        st_distance(c.geometry::geography, s.point::geography) / %(meters_per_mile)s
          as source_distance_miles,
        array[c.id] as path
      from candidates c
      cross join source s
      where st_dwithin(c.geometry::geography, s.point::geography, %(hop_meters)s)

      union all

      select
        next_field.id,
        next_field.name,
        next_field.crop_type,
        next_field.geometry,
        reached.hops + 1 as hops,
        st_distance(next_field.geometry::geography, reached.geometry::geography) / %(meters_per_mile)s
          as trigger_distance_miles,
        st_distance(next_field.geometry::geography, s.point::geography) / %(meters_per_mile)s
          as source_distance_miles,
        reached.path || next_field.id as path
      from reached
      cross join source s
      join candidates next_field
        on next_field.id <> all(reached.path)
       and next_field.geometry && st_expand(reached.geometry, %(hop_degrees)s)
       and st_dwithin(next_field.geometry::geography, reached.geometry::geography, %(hop_meters)s)
      where reached.hops < %(max_hops)s
    ),
    best_reached as (
      select distinct on (id)
        id,
        name,
        crop_type,
        hops,
        trigger_distance_miles,
        source_distance_miles,
        path
      from reached
      order by id, hops, source_distance_miles, trigger_distance_miles
    )
    select
      (select count(*) from scoped_fields) as scoped_field_count,
      (select count(*) from candidates) as candidate_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'field_id', id::text,
            'name', name,
            'crop_type', crop_type,
            'hops', hops,
            'trigger_distance_miles', round(trigger_distance_miles::numeric, 4),
            'source_distance_miles', round(source_distance_miles::numeric, 4),
            'path', path
          )
          order by hops, source_distance_miles, id
        ),
        '[]'::jsonb
      ) as reached_fields
    from best_reached;
    """

    params = {
        "reporter_user_id": reporter_user_id,
        "scope": scope,
        "ignore_crop_filter": ignore_crop_filter,
        "latitude": latitude,
        "longitude": longitude,
        "search_meters": search_meters,
        "hop_meters": hop_meters,
        "search_degrees": search_degrees,
        "hop_degrees": hop_degrees,
        "meters_per_mile": METERS_PER_MILE,
        "crop_keys": crop_keys,
        "max_hops": 25,
    }

    started = time.perf_counter()
    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()

    return {
        "reporter_user_id": reporter_user_id,
        "latitude": latitude,
        "longitude": longitude,
        "search_radius_miles": search_radius_miles,
        "hop_distance_miles": hop_distance_miles,
        "vulnerable_crops": vulnerable_crops,
        "crop_keys": crop_keys,
        "scoped_field_count": row[0],
        "candidate_count": row[1],
        "reached_fields": row[2],
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulate boundary-based adjacency spread.")
    parser.add_argument("--reporter-user-id", default=None)
    parser.add_argument("--scope", choices=["saved", "all"], default="saved")
    parser.add_argument("--ignore-crop-filter", action="store_true")
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--search-radius-miles", type=float, default=25)
    parser.add_argument("--hop-distance-miles", type=float, default=0.5)
    parser.add_argument("--vulnerable-crop", action="append", default=["almond"])
    parser.add_argument("--expect-field-id", action="append", default=[])
    parser.add_argument("--expect-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = run_simulation(
        reporter_user_id=args.reporter_user_id,
        latitude=args.latitude,
        longitude=args.longitude,
        search_radius_miles=args.search_radius_miles,
        hop_distance_miles=args.hop_distance_miles,
        vulnerable_crops=args.vulnerable_crop,
        scope=args.scope,
        ignore_crop_filter=args.ignore_crop_filter,
    )

    reached_ids = {field["field_id"] for field in result["reached_fields"]}
    expected_ids = set(args.expect_field_id)
    missing_ids = sorted(expected_ids - reached_ids)
    unexpected_ids = sorted(reached_ids - expected_ids) if args.expect_only else []
    result["expected_field_ids"] = sorted(expected_ids)
    result["missing_expected_field_ids"] = missing_ids
    result["unexpected_field_ids"] = unexpected_ids

    print(json.dumps(result, indent=2))

    if missing_ids or unexpected_ids:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
