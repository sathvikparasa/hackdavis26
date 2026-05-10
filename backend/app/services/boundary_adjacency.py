import logging
import re

import psycopg

from app.config import get_settings
from app.models import AlertSeverity, FieldAlert, SpreadMethod, SpreadSource, VulnerableCrop
from app.services.spread import ADJACENCY_HOP_DISTANCE_MILES


METERS_PER_MILE = 1609.344
DEGREES_PER_MILE = 1 / 69
MAX_ADJACENCY_HOPS = 25

logger = logging.getLogger(__name__)


def calculate_boundary_adjacency_alerts(
    source: SpreadSource,
    vulnerable_crop: list[VulnerableCrop],
    confidence: float,
    search_radius_miles: float,
    hop_distance_miles: float,
    reporter_user_id: str | None = None,
) -> list[FieldAlert]:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    crop_keys = _affected_crop_keys(source.crop_type, vulnerable_crop)
    if not crop_keys:
        logger.info("Skipping boundary adjacency: no affected crop keys")
        return []

    logger.info(
        "Calculating boundary adjacency crop_keys=%s search_radius_miles=%s hop_miles=%s reporter_scoped=%s",
        sorted(crop_keys),
        search_radius_miles,
        hop_distance_miles,
        bool(reporter_user_id),
    )

    search_meters = max(search_radius_miles, 0) * METERS_PER_MILE
    hop_meters = max(hop_distance_miles, 0) * METERS_PER_MILE
    search_degrees = max(search_radius_miles, 0) * DEGREES_PER_MILE
    hop_degrees = max(hop_distance_miles, 0) * DEGREES_PER_MILE
    scope_sql = _field_scope_sql(reporter_user_id)

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
      where sf.crop_key = any(%(crop_keys)s)
        and sf.point && st_expand(s.point, %(search_degrees)s)
        and st_dwithin(sf.point::geography, s.point::geography, %(search_meters)s)
    ),
    reached as (
      select
        c.id,
        c.name,
        c.crop_type,
        c.point,
        1 as hops,
        st_distance(c.point::geography, s.point::geography) / %(meters_per_mile)s
          as trigger_distance_miles,
        st_distance(c.point::geography, s.point::geography) / %(meters_per_mile)s
          as source_distance_miles,
        array[c.id] as path
      from candidates c
      cross join source s
      where st_dwithin(c.point::geography, s.point::geography, %(hop_meters)s)

      union all

      select
        next_field.id,
        next_field.name,
        next_field.crop_type,
        next_field.point,
        reached.hops + 1 as hops,
        st_distance(next_field.point::geography, reached.point::geography) / %(meters_per_mile)s
          as trigger_distance_miles,
        st_distance(next_field.point::geography, s.point::geography) / %(meters_per_mile)s
          as source_distance_miles,
        reached.path || next_field.id as path
      from reached
      cross join source s
      join candidates next_field
        on next_field.id <> all(reached.path)
       and next_field.point && st_expand(reached.point, %(hop_degrees)s)
       and st_dwithin(next_field.point::geography, reached.point::geography, %(hop_meters)s)
      where reached.hops < %(max_hops)s
    ),
    best_reached as (
      select distinct on (id)
        id::text,
        name,
        crop_type,
        hops,
        trigger_distance_miles,
        source_distance_miles
      from reached
      order by id, hops, source_distance_miles, trigger_distance_miles
    )
    select
      id,
      name,
      crop_type,
      hops,
      trigger_distance_miles,
      source_distance_miles
    from best_reached
    order by hops, source_distance_miles, id;
    """

    params = {
        "latitude": source.latitude,
        "longitude": source.longitude,
        "search_meters": search_meters,
        "hop_meters": hop_meters,
        "search_degrees": search_degrees,
        "hop_degrees": hop_degrees,
        "meters_per_mile": METERS_PER_MILE,
        "crop_keys": sorted(crop_keys),
        "max_hops": MAX_ADJACENCY_HOPS,
        "reporter_user_id": reporter_user_id,
    }

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    logger.info("Boundary adjacency reached %s field(s)", len(rows))
    return [
        _build_alert(
            field_id=row[0],
            field_name=row[1],
            crop_type=row[2],
            hops=int(row[3]),
            trigger_distance=float(row[4]),
            source_distance=float(row[5]),
            source_crop_type=source.crop_type,
            confidence=confidence,
            hop_distance_miles=hop_distance_miles,
        )
        for row in rows
    ]


def _field_scope_sql(reporter_user_id: str | None) -> str:
    if reporter_user_id:
        crop_type_sql = "ff.crop_type"
    else:
        crop_type_sql = "coalesce(nullif(f.main_crop_name, ''), f.main_crop, 'unknown')"

    crop_key_sql = f"""
    case
      when length(trim(regexp_replace(lower({crop_type_sql}), '[^a-z0-9]+', ' ', 'g'))) > 3
       and trim(regexp_replace(lower({crop_type_sql}), '[^a-z0-9]+', ' ', 'g')) like '%%s'
      then left(
        trim(regexp_replace(lower({crop_type_sql}), '[^a-z0-9]+', ' ', 'g')),
        length(trim(regexp_replace(lower({crop_type_sql}), '[^a-z0-9]+', ' ', 'g'))) - 1
      )
      else trim(regexp_replace(lower({crop_type_sql}), '[^a-z0-9]+', ' ', 'g'))
    end
    """

    point_sql = """
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
    )
    """

    if reporter_user_id:
        return f"""
        select
          f.id,
          coalesce(f.unique_id, 'field_' || f.id::text) as name,
          ff.crop_type,
          {crop_key_sql} as crop_key,
          {point_sql} as point
        from public.farmer_fields ff
        join public.profiles p on p.id = ff.profile_id
        join public.fields f on f.id = ff.field_id
        where p.clerk_user_id = %(reporter_user_id)s
          and nullif(trim(ff.crop_type), '') is not null
          and (
            f.geometry is not null
            or (f.label_point ? 'longitude' and f.label_point ? 'latitude')
          )
        """

    return f"""
    select
      f.id,
      coalesce(f.unique_id, 'field_' || f.id::text) as name,
      coalesce(nullif(f.main_crop_name, ''), f.main_crop, 'unknown') as crop_type,
      {crop_key_sql} as crop_key,
      {point_sql} as point
    from public.fields f
    where f.geometry is not null
      or (f.label_point ? 'longitude' and f.label_point ? 'latitude')
    """


def _build_alert(
    field_id: str,
    field_name: str,
    crop_type: str,
    hops: int,
    trigger_distance: float,
    source_distance: float,
    source_crop_type: str,
    confidence: float,
    hop_distance_miles: float,
) -> FieldAlert:
    effective_hop_distance = max(hop_distance_miles, 0.001)
    hop_score = max(0, 1 - (trigger_distance / effective_hop_distance))
    hop_penalty = 0.85 ** max(hops - 1, 0)
    adjacency_score = max(0.05, hop_score * hop_penalty)
    crop_bonus = 0.1 if _crop_key(crop_type) == _crop_key(source_crop_type) else 0
    confidence_weight = max(0, min(confidence, 1))
    risk_score = min(1, (adjacency_score * confidence_weight) + crop_bonus)

    reasons = [f"Field crop is vulnerable and boundary-adjacent in {hops} hop(s)"]
    if crop_bonus:
        reasons.append("Field crop matches the detection crop")
    else:
        reasons.append("Field crop is listed as vulnerable to this pest")

    return FieldAlert(
        field_id=field_id,
        field_name=field_name,
        crop_type=crop_type,
        risk_score=round(risk_score, 3),
        severity=_severity_for_score(risk_score),
        distance=round(source_distance, 3),
        matched_methods=[SpreadMethod.adjacency],
        reasons=reasons,
    )


def _affected_crop_keys(source_crop_type: str, vulnerable_crop: list[VulnerableCrop]) -> set[str]:
    crops = {_crop_key(source_crop_type)}
    crops.update(_crop_key(crop.crop_type) for crop in vulnerable_crop)
    return {crop for crop in crops if crop}


def _crop_key(crop_type: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", crop_type.lower()).strip()
    words = []
    for word in normalized.split():
        if len(word) > 3 and word.endswith("s"):
            word = word[:-1]
        words.append(word)
    return " ".join(words)


def _severity_for_score(score: float) -> AlertSeverity:
    if score >= 0.7:
        return AlertSeverity.high
    if score >= 0.35:
        return AlertSeverity.medium
    return AlertSeverity.low
