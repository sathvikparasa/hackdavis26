import argparse
import html
import json
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.models import SpreadSource, VulnerableCrop  # noqa: E402
from app.services.irrigation import calculate_irrigation_alerts  # noqa: E402
from simulate_boundary_spread import run_simulation as run_boundary_simulation  # noqa: E402


WIDTH = 1100
HEIGHT = 760
PADDING = 48


def _crop_key(crop: str) -> str:
    normalized = " ".join("".join(char if char.isalnum() else " " for char in crop.lower()).split())
    if len(normalized) > 3 and normalized.endswith("s"):
        return normalized[:-1]
    return normalized


def _load_context(
    reporter_user_id: str,
    latitude: float,
    longitude: float,
    vulnerable_crops: list[str],
) -> dict:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")

    crop_keys = sorted({_crop_key(crop) for crop in vulnerable_crops})
    sql = """
    with source as (
      select st_setsrid(st_makepoint(%s, %s), 4326) as point
    ),
    saved_fields as (
      select
        f.id::text,
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
        st_asgeojson(f.geometry)::jsonb as geometry
      from public.farmer_fields ff
      join public.profiles p on p.id = ff.profile_id
      join public.fields f on f.id = ff.field_id
      where p.clerk_user_id = %s
        and f.geometry is not null
    ),
    districts as (
      select
        id::text,
        agency_name,
        st_asgeojson(geometry)::jsonb as geometry
      from public.irrigation_districts d
      cross join source s
      where d.geometry && s.point
        and st_intersects(d.geometry, s.point)
    )
    select
      coalesce((select jsonb_agg(saved_fields) from saved_fields), '[]'::jsonb),
      coalesce((select jsonb_agg(districts) from districts), '[]'::jsonb);
    """

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (longitude, latitude, reporter_user_id))
            fields, districts = cur.fetchone()

    return {
        "fields": fields,
        "districts": districts,
        "crop_keys": crop_keys,
    }


def _positions_from_geometry(geometry: dict) -> list[tuple[float, float]]:
    coords = geometry.get("coordinates", [])
    if geometry.get("type") == "Polygon":
        rings = coords
    elif geometry.get("type") == "MultiPolygon":
        rings = [ring for polygon in coords for ring in polygon]
    else:
        return []
    return [(float(lon), float(lat)) for ring in rings for lon, lat in ring]


def _paths_from_geometry(
    geometry: dict,
    project,
) -> list[str]:
    coords = geometry.get("coordinates", [])
    if geometry.get("type") == "Polygon":
        polygons = [coords]
    elif geometry.get("type") == "MultiPolygon":
        polygons = coords
    else:
        return []

    paths = []
    for polygon in polygons:
        for ring in polygon:
            points = [project(float(lon), float(lat)) for lon, lat in ring]
            if not points:
                continue
            path_data = " ".join(
                f"{'M' if index == 0 else 'L'} {x:.2f} {y:.2f}"
                for index, (x, y) in enumerate(points)
            )
            paths.append(path_data + " Z")
    return paths


def _make_projector(features: list[dict], source_lon: float, source_lat: float):
    positions = [(source_lon, source_lat)]
    for feature in features:
        positions.extend(_positions_from_geometry(feature["geometry"]))

    min_lon = min(lon for lon, _ in positions)
    max_lon = max(lon for lon, _ in positions)
    min_lat = min(lat for _, lat in positions)
    max_lat = max(lat for _, lat in positions)
    lon_span = max(max_lon - min_lon, 0.001)
    lat_span = max(max_lat - min_lat, 0.001)
    scale = min((WIDTH - (PADDING * 2)) / lon_span, (HEIGHT - (PADDING * 2)) / lat_span)
    rendered_width = lon_span * scale
    rendered_height = lat_span * scale
    x_offset = (WIDTH - rendered_width) / 2
    y_offset = (HEIGHT - rendered_height) / 2

    def project(lon: float, lat: float) -> tuple[float, float]:
        x = x_offset + ((lon - min_lon) * scale)
        y = y_offset + ((max_lat - lat) * scale)
        return x, y

    return project


def _render_html(
    title: str,
    source_lon: float,
    source_lat: float,
    fields: list[dict],
    districts: list[dict],
    reached_ids: set[str],
    summary: dict,
    output_path: Path,
) -> None:
    features = fields + districts
    project = _make_projector(features, source_lon, source_lat)
    svg_parts = []

    for district in districts:
        for path in _paths_from_geometry(district["geometry"], project):
            svg_parts.append(
                f'<path d="{path}" fill="#8ecae6" fill-opacity="0.18" '
                f'stroke="#219ebc" stroke-width="2" />'
            )

    for field in fields:
        is_reached = field["id"] in reached_ids
        is_vulnerable = field["crop_key"] in summary.get("crop_keys", [])
        fill = "#2563eb" if is_reached else ("#93c5fd" if is_vulnerable else "#d1d5db")
        stroke = "#1d4ed8" if is_reached else "#6b7280"
        opacity = "0.72" if is_reached else "0.42"
        for path in _paths_from_geometry(field["geometry"], project):
            svg_parts.append(
                f'<path d="{path}" fill="{fill}" fill-opacity="{opacity}" '
                f'stroke="{stroke}" stroke-width="2" />'
            )

        points = _positions_from_geometry(field["geometry"])
        if points:
            lon = sum(point[0] for point in points) / len(points)
            lat = sum(point[1] for point in points) / len(points)
            x, y = project(lon, lat)
            label = html.escape(f'{field["id"]} {field["crop_type"]}')
            svg_parts.append(
                f'<text x="{x:.2f}" y="{y:.2f}" font-size="14" font-weight="700" '
                f'text-anchor="middle" fill="#111827">{label}</text>'
            )

    source_x, source_y = project(source_lon, source_lat)
    svg_parts.append(
        f'<circle cx="{source_x:.2f}" cy="{source_y:.2f}" r="9" fill="#ef4444" stroke="#7f1d1d" stroke-width="3" />'
    )
    svg_parts.append(
        f'<text x="{source_x + 12:.2f}" y="{source_y - 12:.2f}" font-size="15" font-weight="800" fill="#7f1d1d">source</text>'
    )

    summary_json = html.escape(json.dumps(summary, indent=2, default=str))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>{html.escape(title)}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #111827; }}
    .wrap {{ display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 20px; align-items: start; }}
    svg {{ width: 100%; height: auto; border: 1px solid #d1d5db; background: #f9fafb; }}
    pre {{ white-space: pre-wrap; background: #111827; color: #f9fafb; padding: 14px; border-radius: 8px; font-size: 12px; }}
    .legend {{ display: flex; gap: 14px; margin: 10px 0 18px; font-size: 14px; }}
    .swatch {{ display: inline-block; width: 14px; height: 14px; margin-right: 6px; vertical-align: -2px; border: 1px solid #6b7280; }}
  </style>
</head>
<body>
  <h1>{html.escape(title)}</h1>
  <div class="legend">
    <span><span class="swatch" style="background:#2563eb"></span>reached/alerted</span>
    <span><span class="swatch" style="background:#93c5fd"></span>vulnerable candidate</span>
    <span><span class="swatch" style="background:#8ecae6"></span>irrigation district</span>
    <span><span class="swatch" style="background:#ef4444"></span>source</span>
  </div>
  <div class="wrap">
    <svg viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="{html.escape(title)}">
      {''.join(svg_parts)}
    </svg>
    <pre>{summary_json}</pre>
  </div>
</body>
</html>
""",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render spread simulation visuals.")
    parser.add_argument("--reporter-user-id", required=True)
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--search-radius-miles", type=float, default=10)
    parser.add_argument("--hop-distance-miles", type=float, default=1)
    parser.add_argument("--source-crop", default="almond")
    parser.add_argument("--vulnerable-crop", action="append", default=["almond"])
    parser.add_argument("--output-dir", type=Path, default=Path("tests/output"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    context = _load_context(
        reporter_user_id=args.reporter_user_id,
        latitude=args.latitude,
        longitude=args.longitude,
        vulnerable_crops=args.vulnerable_crop,
    )
    boundary_result = run_boundary_simulation(
        reporter_user_id=args.reporter_user_id,
        latitude=args.latitude,
        longitude=args.longitude,
        search_radius_miles=args.search_radius_miles,
        hop_distance_miles=args.hop_distance_miles,
        vulnerable_crops=args.vulnerable_crop,
    )
    irrigation_alerts = calculate_irrigation_alerts(
        source=SpreadSource(
            latitude=args.latitude,
            longitude=args.longitude,
            crop_type=args.source_crop,
        ),
        vulnerable_crop=[
            VulnerableCrop(
                crop_type=crop,
                damage_type="visualization",
                duration=1,
                recommendations="visualization",
            )
            for crop in args.vulnerable_crop
        ],
        confidence=0.95,
        search_radius_miles=args.search_radius_miles,
        reporter_user_id=args.reporter_user_id,
    )
    irrigation_result = {
        "alerts": [alert.model_dump(mode="json") for alert in irrigation_alerts],
        "crop_keys": context["crop_keys"],
    }

    boundary_ids = {field["field_id"] for field in boundary_result["reached_fields"]}
    irrigation_ids = {alert.field_id for alert in irrigation_alerts}
    boundary_summary = {**boundary_result, "crop_keys": context["crop_keys"]}
    irrigation_summary = {
        "reporter_user_id": args.reporter_user_id,
        "latitude": args.latitude,
        "longitude": args.longitude,
        "search_radius_miles": args.search_radius_miles,
        "vulnerable_crops": args.vulnerable_crop,
        "alerts": irrigation_result["alerts"],
        "crop_keys": context["crop_keys"],
        "source_districts": [
            {"id": district["id"], "agency_name": district["agency_name"]}
            for district in context["districts"]
        ],
    }

    boundary_path = args.output_dir / "boundary_adjacency_simulation.html"
    irrigation_path = args.output_dir / "irrigation_water_simulation.html"
    _render_html(
        title="Boundary Adjacency Simulation",
        source_lon=args.longitude,
        source_lat=args.latitude,
        fields=context["fields"],
        districts=[],
        reached_ids=boundary_ids,
        summary=boundary_summary,
        output_path=boundary_path,
    )
    _render_html(
        title="Irrigation Water Simulation",
        source_lon=args.longitude,
        source_lat=args.latitude,
        fields=context["fields"],
        districts=context["districts"],
        reached_ids=irrigation_ids,
        summary=irrigation_summary,
        output_path=irrigation_path,
    )

    print(json.dumps({
        "boundary_visual": str(boundary_path.resolve()),
        "irrigation_visual": str(irrigation_path.resolve()),
        "boundary_reached_field_ids": sorted(boundary_ids),
        "irrigation_alert_field_ids": sorted(irrigation_ids),
    }, indent=2))


if __name__ == "__main__":
    main()
