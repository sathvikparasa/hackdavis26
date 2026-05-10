import re

import psycopg

from app.config import get_settings
from app.models import AlertSeverity, FieldAlert, SpreadMethod, SpreadSource, VulnerableCrop


METERS_PER_MILE = 1609.344
DEGREES_PER_MILE = 1 / 69
MIN_WATER_RISK_SCORE = 0.05


def calculate_irrigation_alerts(
    source: SpreadSource,
    vulnerable_crop: list[VulnerableCrop],
    confidence: float,
    search_radius_miles: float,
    reporter_user_id: str | None = None,
) -> list[FieldAlert]:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    crop_keys = _affected_crop_keys(source.crop_type, vulnerable_crop)
    if not crop_keys:
        return []

    search_radius_miles = max(search_radius_miles, 0)
    search_meters = search_radius_miles * METERS_PER_MILE
    search_degrees = search_radius_miles * DEGREES_PER_MILE
    field_scope_sql = _field_scope_sql(reporter_user_id)

    sql = f"""
    with
    source as (
      select st_setsrid(st_makepoint(%(longitude)s, %(latitude)s), 4326) as point
    ),
    source_districts as materialized (
      select id, agency_name, geometry
      from public.irrigation_districts d
      cross join source s
      where d.geometry && s.point
        and st_intersects(d.geometry, s.point)
    ),
    scoped_fields as materialized (
      {field_scope_sql}
    ),
    candidates as materialized (
      select sf.*
      from scoped_fields sf
      cross join source s
      where sf.crop_key = any(%(crop_keys)s)
        and sf.geometry && st_expand(s.point, %(search_degrees)s)
        and st_dwithin(sf.geometry::geography, s.point::geography, %(search_meters)s)
    ),
    district_matches as (
      select distinct on (c.id)
        c.id::text,
        c.name,
        c.crop_type,
        d.agency_name,
        st_distance(c.point::geography, s.point::geography) / %(meters_per_mile)s
          as distance_miles
      from candidates c
      cross join source s
      join source_districts d
        on c.geometry && d.geometry
       and st_intersects(c.geometry, d.geometry)
      order by c.id, distance_miles, d.agency_name
    )
    select
      id,
      name,
      crop_type,
      agency_name,
      distance_miles
    from district_matches
    order by distance_miles, id;
    """

    params = {
        "latitude": source.latitude,
        "longitude": source.longitude,
        "search_meters": search_meters,
        "search_degrees": search_degrees,
        "meters_per_mile": METERS_PER_MILE,
        "crop_keys": sorted(crop_keys),
        "reporter_user_id": reporter_user_id,
    }

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return [
        _build_alert(
            field_id=row[0],
            field_name=row[1],
            crop_type=row[2],
            agency_name=row[3],
            distance=float(row[4]),
            source_crop_type=source.crop_type,
            confidence=confidence,
            search_radius_miles=search_radius_miles,
        )
        for row in rows
    ]


def _field_scope_sql(reporter_user_id: str | None) -> str:
    if reporter_user_id:
        crop_type_sql = "ff.crop_type"
    else:
        crop_type_sql = "coalesce(f.main_crop, 'unknown')"

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
          f.geometry,
          {point_sql} as point
        from public.farmer_fields ff
        join public.profiles p on p.id = ff.profile_id
        join public.fields f on f.id = ff.field_id
        where p.clerk_user_id = %(reporter_user_id)s
          and nullif(trim(ff.crop_type), '') is not null
          and f.geometry is not null
        """

    return f"""
    select
      f.id,
      coalesce(f.unique_id, 'field_' || f.id::text) as name,
      coalesce(f.main_crop, 'unknown') as crop_type,
      {crop_key_sql} as crop_key,
      f.geometry,
      {point_sql} as point
    from public.fields f
    where f.geometry is not null
    """


def _build_alert(
    field_id: str,
    field_name: str,
    crop_type: str,
    agency_name: str,
    distance: float,
    source_crop_type: str,
    confidence: float,
    search_radius_miles: float,
) -> FieldAlert:
    distance_score = (
        1 - (distance / search_radius_miles)
        if search_radius_miles > 0
        else MIN_WATER_RISK_SCORE
    )
    irrigation_score = max(MIN_WATER_RISK_SCORE, distance_score)
    crop_bonus = 0.1 if _crop_key(crop_type) == _crop_key(source_crop_type) else 0
    confidence_weight = max(0, min(confidence, 1))
    risk_score = min(1, (irrigation_score * confidence_weight) + crop_bonus)

    reasons = [
        f"Field is in the same irrigation district as the report location: {agency_name}",
        "Water risk is weighted by distance within the shared irrigation district",
    ]
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
        distance=round(distance, 3),
        matched_methods=[SpreadMethod.water],
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
