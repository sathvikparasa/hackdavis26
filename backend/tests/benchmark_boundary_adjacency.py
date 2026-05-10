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


def _field_scope_sql(reporter_user_id: str | None) -> str:
    if reporter_user_id:
        return """
        select
          f.id,
          coalesce(f.unique_id, 'field_' || f.id::text) as name,
          ff.crop_type,
          f.geometry
        from public.farmer_fields ff
        join public.profiles p on p.id = ff.profile_id
        join public.fields f on f.id = ff.field_id
        where p.clerk_user_id = %(reporter_user_id)s
          and nullif(trim(ff.crop_type), '') is not null
          and f.geometry is not null
        """

    return """
    select
      f.id,
      coalesce(f.unique_id, 'field_' || f.id::text) as name,
      coalesce(f.main_crop, 'unknown') as crop_type,
      f.geometry
    from public.fields f
    where f.geometry is not null
    """


def run_benchmark(
    latitude: float,
    longitude: float,
    search_radius_miles: float,
    hop_distance_miles: float,
    reporter_user_id: str | None,
) -> dict:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    search_meters = search_radius_miles * METERS_PER_MILE
    hop_meters = hop_distance_miles * METERS_PER_MILE
    search_degrees = search_radius_miles * DEGREES_PER_MILE
    hop_degrees = hop_distance_miles * DEGREES_PER_MILE
    scope_sql = _field_scope_sql(reporter_user_id)

    candidate_sql = f"""
    with source as (
      select st_setsrid(st_makepoint(%(longitude)s, %(latitude)s), 4326) as point
    ),
    scoped_fields as materialized (
      {scope_sql}
    ),
    candidates as materialized (
      select sf.*
      from scoped_fields sf
      cross join source s
      where sf.geometry && st_expand(s.point, %(search_degrees)s)
        and st_dwithin(sf.geometry::geography, s.point::geography, %(search_meters)s)
    )
    select count(*) from candidates;
    """

    source_hits_sql = f"""
    with source as (
      select st_setsrid(st_makepoint(%(longitude)s, %(latitude)s), 4326) as point
    ),
    scoped_fields as materialized (
      {scope_sql}
    ),
    candidates as materialized (
      select sf.*
      from scoped_fields sf
      cross join source s
      where sf.geometry && st_expand(s.point, %(search_degrees)s)
        and st_dwithin(sf.geometry::geography, s.point::geography, %(search_meters)s)
    )
    select
      id::text,
      name,
      crop_type,
      st_distance(geometry::geography, (select point from source)::geography) / %(meters_per_mile)s
        as boundary_distance_miles
    from candidates
    where st_dwithin(
      geometry::geography,
      (select point from source)::geography,
      %(hop_meters)s
    )
    order by boundary_distance_miles
    limit %(sample_limit)s;
    """

    edge_count_sql = f"""
    with source as (
      select st_setsrid(st_makepoint(%(longitude)s, %(latitude)s), 4326) as point
    ),
    scoped_fields as materialized (
      {scope_sql}
    ),
    candidates as materialized (
      select sf.*
      from scoped_fields sf
      cross join source s
      where sf.geometry && st_expand(s.point, %(search_degrees)s)
        and st_dwithin(sf.geometry::geography, s.point::geography, %(search_meters)s)
    )
    select count(*)
    from candidates a
    join candidates b
      on a.id < b.id
     and a.geometry && st_expand(b.geometry, %(hop_degrees)s)
     and st_dwithin(a.geometry::geography, b.geometry::geography, %(hop_meters)s);
    """

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "search_meters": search_meters,
        "hop_meters": hop_meters,
        "search_degrees": search_degrees,
        "hop_degrees": hop_degrees,
        "meters_per_mile": METERS_PER_MILE,
        "sample_limit": 20,
        "reporter_user_id": reporter_user_id,
    }

    timings = {}
    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            started = time.perf_counter()
            cur.execute(candidate_sql, params)
            candidate_count = cur.fetchone()[0]
            timings["candidate_count_ms"] = (time.perf_counter() - started) * 1000

            started = time.perf_counter()
            cur.execute(source_hits_sql, params)
            source_hits = cur.fetchall()
            timings["source_hits_ms"] = (time.perf_counter() - started) * 1000

            started = time.perf_counter()
            cur.execute(edge_count_sql, params)
            edge_count = cur.fetchone()[0]
            timings["edge_count_ms"] = (time.perf_counter() - started) * 1000

    return {
        "scope": "farmer_fields" if reporter_user_id else "all_fields",
        "latitude": latitude,
        "longitude": longitude,
        "search_radius_miles": search_radius_miles,
        "hop_distance_miles": hop_distance_miles,
        "candidate_count": candidate_count,
        "source_hit_count_sampled": len(source_hits),
        "source_hits_sample": [
            {
                "field_id": row[0],
                "name": row[1],
                "crop_type": row[2],
                "boundary_distance_miles": round(float(row[3]), 4),
            }
            for row in source_hits
        ],
        "adjacency_edge_count": edge_count,
        "timings_ms": {key: round(value, 1) for key, value in timings.items()},
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark boundary-based field adjacency.")
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--search-radius-miles", type=float, default=25)
    parser.add_argument("--hop-distance-miles", type=float, default=0.5)
    parser.add_argument("--reporter-user-id", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = run_benchmark(
        latitude=args.latitude,
        longitude=args.longitude,
        search_radius_miles=args.search_radius_miles,
        hop_distance_miles=args.hop_distance_miles,
        reporter_user_id=args.reporter_user_id,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
