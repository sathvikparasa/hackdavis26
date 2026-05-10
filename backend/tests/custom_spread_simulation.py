import json
from dataclasses import dataclass
from math import atan2, cos, degrees, radians, sin
from pathlib import Path


OUTPUT_DIR = Path("tests/output")
BOUNDARY_OUTPUT = OUTPUT_DIR / "custom_boundary_multihop_simulation.html"
IRRIGATION_OUTPUT = OUTPUT_DIR / "custom_irrigation_simulation.html"
WIND_OUTPUT = OUTPUT_DIR / "custom_wind_cone_simulation.html"

WIDTH = 1100
HEIGHT = 720
MAP_PAD_X = 92
MAP_PAD_Y = 82
ADJACENCY_HOP_MILES = 0.5
IRRIGATION_RADIUS_MILES = 4.0
WIND_DIRECTION_DEGREES = 135.0
WIND_SPEED_MPH = 18.0
WIND_TRAVEL_MILES = 4.0
WIND_CONE_HALF_ANGLE_DEGREES = 52.0


@dataclass(frozen=True)
class Field:
    id: str
    crop: str
    x: float
    y: float
    width: float = 0.32
    height: float = 0.32


BASE_FIELDS = [
    Field("A", "almonds", 0.0, 0.0),
    Field("B", "almonds", 0.62, 0.0),
    Field("C", "almonds", 1.24, 0.02),
    Field("D", "almonds", 1.86, -0.02),
    Field("E", "almonds", 2.48, 0.02),
    Field("F", "corn", 1.24, 0.62),
    Field("G", "almonds", 3.45, 0.0),
    Field("H", "almonds", 0.5, 0.72),
    Field("I", "almonds", 4.35, 0.0),
]

WIND_FIELDS = [
    Field("A", "almonds", 0.0, 0.0),
    Field("J", "almonds", 1.0, -1.0),
    Field("K", "almonds", 1.6, -0.7),
    Field("L", "almonds", 0.7, -1.7),
    Field("M", "almonds", 1.7, 1.9),
    Field("N", "almonds", -1.0, 1.0),
    Field("F", "corn", 2.25, -1.1),
]


def crop_key(crop: str) -> str:
    key = crop.lower().strip()
    if len(key) > 3 and key.endswith("s"):
        return key[:-1]
    return key


def boundary_distance(a: Field, b: Field) -> float:
    dx = max(abs(a.x - b.x) - ((a.width + b.width) / 2), 0)
    dy = max(abs(a.y - b.y) - ((a.height + b.height) / 2), 0)
    return (dx * dx + dy * dy) ** 0.5


def center_distance(a: Field, b: Field) -> float:
    dx = a.x - b.x
    dy = a.y - b.y
    return (dx * dx + dy * dy) ** 0.5


def bearing_degrees(source: Field, target: Field) -> float:
    return (degrees(atan2(target.x - source.x, target.y - source.y)) + 360) % 360


def angle_difference(a: float, b: float) -> float:
    diff = abs(a - b) % 360
    return 360 - diff if diff > 180 else diff


def wind_endpoint(source: Field, bearing: float, distance: float) -> tuple[float, float]:
    angle = radians(bearing)
    return source.x + (sin(angle) * distance), source.y + (cos(angle) * distance)


def wind_cone_points(source: Field) -> list[tuple[float, float]]:
    return [
        wind_endpoint(source, WIND_DIRECTION_DEGREES - WIND_CONE_HALF_ANGLE_DEGREES, WIND_TRAVEL_MILES),
        wind_endpoint(source, WIND_DIRECTION_DEGREES, WIND_TRAVEL_MILES),
        wind_endpoint(source, WIND_DIRECTION_DEGREES + WIND_CONE_HALF_ANGLE_DEGREES, WIND_TRAVEL_MILES),
    ]


def simulate_boundary() -> list[dict]:
    vulnerable_crop = "almond"
    source = BASE_FIELDS[0]
    candidates = [field for field in BASE_FIELDS if crop_key(field.crop) == vulnerable_crop]
    unvisited = {field.id: field for field in candidates}
    reached = {}
    frontier = [(source, 0, [source.id])]

    while frontier and unvisited:
        next_frontier = []
        for origin, hops, path in frontier:
            for field_id, field in list(unvisited.items()):
                distance = boundary_distance(origin, field)
                if distance > ADJACENCY_HOP_MILES:
                    continue
                reached[field_id] = {
                    "field_id": field.id,
                    "crop": field.crop,
                    "hops": hops + 1,
                    "trigger_distance_miles": round(distance, 3),
                    "source_distance_miles": round(center_distance(source, field), 3),
                    "path": path + [field.id],
                }
                next_frontier.append((field, hops + 1, path + [field.id]))
                unvisited.pop(field_id)
        frontier = next_frontier

    return sorted(reached.values(), key=lambda item: (item["hops"], item["source_distance_miles"]))


def simulate_irrigation() -> list[dict]:
    vulnerable_crop = "almond"
    source = BASE_FIELDS[0]
    alerts = []
    for field in BASE_FIELDS:
        if crop_key(field.crop) != vulnerable_crop:
            continue
        if not is_inside_irrigation_district(field):
            continue
        distance = center_distance(source, field)
        if distance > IRRIGATION_RADIUS_MILES:
            continue
        risk_score = max(0.05, 1 - (distance / IRRIGATION_RADIUS_MILES))
        alerts.append(
            {
                "field_id": field.id,
                "crop": field.crop,
                "distance_miles": round(distance, 3),
                "risk_score": round(risk_score, 3),
                "matched_methods": ["water"],
                "reason": "Same custom irrigation district, weighted by distance",
            }
        )
    return sorted(alerts, key=lambda item: item["risk_score"], reverse=True)


def simulate_wind() -> list[dict]:
    vulnerable_crop = "almond"
    source = WIND_FIELDS[0]
    alerts = []
    speed_score = min(max(WIND_SPEED_MPH, 0) / 20, 1)

    for field in WIND_FIELDS:
        if crop_key(field.crop) != vulnerable_crop:
            continue
        distance = center_distance(source, field)
        if distance > WIND_TRAVEL_MILES:
            continue
        bearing = WIND_DIRECTION_DEGREES if distance == 0 else bearing_degrees(source, field)
        angle = 0 if distance == 0 else angle_difference(bearing, WIND_DIRECTION_DEGREES)
        alignment_score = max(0, cos(radians(angle)))
        if alignment_score <= 0:
            continue
        distance_score = max(0, 1 - (distance / WIND_TRAVEL_MILES))
        risk_score = alignment_score * distance_score * max(speed_score, 0.2)
        if risk_score <= 0:
            continue
        alerts.append(
            {
                "field_id": field.id,
                "crop": field.crop,
                "distance_miles": round(distance, 3),
                "bearing_degrees": round(bearing, 1),
                "angle_from_wind_degrees": round(angle, 1),
                "risk_score": round(risk_score, 3),
                "matched_methods": ["wind"],
                "reason": "Inside the forward wind cone with cosine falloff",
            }
        )

    return sorted(alerts, key=lambda item: item["risk_score"], reverse=True)


def is_inside_irrigation_district(field: Field) -> bool:
    return -0.75 <= field.x <= 3.75 and -1.0 <= field.y <= 1.95


def make_projector(fields: list[Field], show_district: bool, show_wind: bool = False):
    min_x = min(field.x - (field.width / 2) for field in fields)
    max_x = max(field.x + (field.width / 2) for field in fields)
    min_y = min(field.y - (field.height / 2) for field in fields)
    max_y = max(field.y + (field.height / 2) for field in fields)

    if show_district:
        min_x = min(min_x, -0.75)
        max_x = max(max_x, 3.75)
        min_y = min(min_y, -1.0)
        max_y = max(max_y, 1.95)
    elif show_wind:
        cone_points = wind_cone_points(fields[0])
        cone_x = [point[0] for point in cone_points]
        cone_y = [point[1] for point in cone_points]
        min_x = min(min_x, min(cone_x)) - 0.35
        max_x = max(max_x, max(cone_x)) + 0.35
        min_y = min(min_y, min(cone_y)) - 0.35
        max_y = max(max_y, max(cone_y)) + 0.35
    else:
        min_x = min(min_x, fields[0].x - 0.95)
        max_y = max(max_y, fields[0].y + 0.55)

    span_x = max(max_x - min_x, 0.1)
    span_y = max(max_y - min_y, 0.1)
    scale = min((WIDTH - (MAP_PAD_X * 2)) / span_x, (HEIGHT - (MAP_PAD_Y * 2)) / span_y)
    rendered_w = span_x * scale
    rendered_h = span_y * scale
    offset_x = (WIDTH - rendered_w) / 2
    offset_y = (HEIGHT - rendered_h) / 2

    def project(x: float, y: float) -> tuple[float, float]:
        return offset_x + ((x - min_x) * scale), offset_y + ((max_y - y) * scale)

    return project, scale


def to_screen(field: Field, project, scale: float) -> tuple[float, float, float, float]:
    x, y = project(field.x, field.y)
    w = field.width * scale
    h = field.height * scale
    return x - (w / 2), y - (h / 2), w, h


def field_center(field: Field, project) -> tuple[float, float]:
    return project(field.x, field.y)


def trimmed_connector(start: Field, end: Field, project, scale: float) -> tuple[float, float, float, float]:
    sx, sy = field_center(start, project)
    ex, ey = field_center(end, project)
    dx = ex - sx
    dy = ey - sy
    length = max(((dx * dx) + (dy * dy)) ** 0.5, 1)
    ux = dx / length
    uy = dy / length
    start_trim = max(start.width, start.height) * scale * 0.72
    end_trim = max(end.width, end.height) * scale * 0.8
    return (
        sx + (ux * start_trim),
        sy + (uy * start_trim),
        ex - (ux * end_trim),
        ey - (uy * end_trim),
    )


def render(
    title: str,
    subtitle: str,
    reached_ids: set[str],
    summary: dict,
    output_path: Path,
    fields: list[Field],
    show_district: bool,
    show_wind: bool = False,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    parts = []
    field_by_id = {field.id: field for field in fields}
    project, scale = make_projector(fields, show_district, show_wind)

    parts.append(
        '<defs>'
        '<linearGradient id="fieldGradient" x1="0" x2="1" y1="0" y2="1">'
        '<stop offset="0%" stop-color="#60a5fa" />'
        '<stop offset="100%" stop-color="#1d4ed8" />'
        '</linearGradient>'
        '<linearGradient id="waterGradient" x1="0" x2="1" y1="0" y2="1">'
        '<stop offset="0%" stop-color="#67e8f9" />'
        '<stop offset="100%" stop-color="#0e7490" />'
        '</linearGradient>'
        '<marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">'
        '<path d="M0,0 L0,6 L9,3 z" fill="#1d4ed8" />'
        '</marker>'
        '</defs>'
    )

    parts.append(
        '<rect x="18" y="18" width="1064" height="684" rx="26" fill="#ffffff" '
        'stroke="#dbeafe" stroke-width="2" />'
    )
    parts.append(
        '<path d="M70 628 C240 568 345 674 514 610 C687 545 755 641 1010 574" '
        'fill="none" stroke="#e0f2fe" stroke-width="42" stroke-linecap="round" opacity="0.9" />'
    )

    if show_district:
        district_x, district_y = project(-0.75, 1.95)
        district_x2, district_y2 = project(3.75, -1.0)
        district_w = district_x2 - district_x
        district_h = district_y2 - district_y
        parts.append(
            f'<rect x="{district_x}" y="{district_y}" width="{district_w}" height="{district_h}" '
            'rx="24" fill="#cffafe" fill-opacity="0.64" stroke="#0891b2" stroke-width="3" />'
        )
        parts.append(
            f'<text x="{district_x + 18:.1f}" y="{district_y + 30:.1f}" font-size="17" '
            'font-weight="800" fill="#155e75">Shared irrigation district</text>'
        )

    if show_wind:
        source = fields[0]
        sx, sy = field_center(source, project)
        left, far, right = wind_cone_points(source)
        left_x, left_y = project(*left)
        right_x, right_y = project(*right)
        far_x, far_y = project(*far)
        parts.append(
            f'<path d="M {sx:.1f} {sy:.1f} L {left_x:.1f} {left_y:.1f} '
            f'Q {far_x:.1f} {far_y:.1f} {right_x:.1f} {right_y:.1f} Z" '
            'fill="#bfdbfe" fill-opacity="0.42" stroke="#2563eb" stroke-width="3" '
            'stroke-dasharray="12 8" />'
        )
        parts.append(
            f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{far_x:.1f}" y2="{far_y:.1f}" '
            'stroke="#2563eb" stroke-width="4" stroke-linecap="round" marker-end="url(#arrow)" />'
        )
        parts.append(
            f'<text x="{far_x + 12:.1f}" y="{far_y + 22:.1f}" font-size="17" '
            'font-weight="900" fill="#1d4ed8">wind direction</text>'
        )

    if not show_district and not show_wind:
        for item in summary["reached"]:
            path = item["path"]
            for start_id, end_id in zip(path, path[1:]):
                if start_id == end_id:
                    continue
                start = field_by_id[start_id]
                end = field_by_id[end_id]
                sx, sy, ex, ey = trimmed_connector(start, end, project, scale)
                parts.append(
                    f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" '
                    'stroke="#1d4ed8" stroke-width="4" stroke-linecap="round" '
                    'marker-end="url(#arrow)" opacity="0.72" />'
                )

    if show_district:
        source = fields[0]
        sx, sy = field_center(source, project)
        radius = IRRIGATION_RADIUS_MILES * scale
        parts.append(
            f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{radius:.1f}" fill="#06b6d4" '
            'fill-opacity="0.045" stroke="#06b6d4" stroke-width="2" stroke-dasharray="10 9" />'
        )

    for field in fields:
        x, y, w, h = to_screen(field, project, scale)
        reached = field.id in reached_ids
        same_crop = crop_key(field.crop) == "almond"
        outside_district = show_district and same_crop and not is_inside_irrigation_district(field)
        outside_wind_cone = show_wind and same_crop and field.id not in reached_ids
        wrong_crop = field.crop != "almonds"
        fill = "url(#waterGradient)" if reached and show_district else ("url(#fieldGradient)" if reached else "#f8fafc")
        stroke = "#0e7490" if reached and show_district else ("#1d4ed8" if reached else "#94a3b8")
        if reached and show_wind:
            fill = "#3b82f6"
            stroke = "#1d4ed8"
        if wrong_crop:
            fill = "#fde68a"
            stroke = "#b45309"
        if outside_district:
            fill = "#e5e7eb"
            stroke = "#64748b"
        if outside_wind_cone:
            fill = "#e5e7eb"
            stroke = "#64748b"
        dash = 'stroke-dasharray="7 5"' if outside_district or outside_wind_cone else ""
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'rx="6" fill="{fill}" stroke="{stroke}" stroke-width="2.5" '
            f'{dash} filter="drop-shadow(0 6px 9px rgba(15,23,42,0.18))" />'
        )
        parts.append(
            f'<text x="{x + w / 2:.1f}" y="{y + h / 2 + 5:.1f}" font-size="15" '
            f'font-weight="900" text-anchor="middle" fill="#0f172a">{field.id}</text>'
        )
        parts.append(
            f'<text x="{x + w / 2:.1f}" y="{y + h + 16:.1f}" font-size="11" '
            f'text-anchor="middle" fill="#374151">{field.crop}</text>'
        )

    source = fields[0]
    sx, sy = field_center(source, project)
    label_width = 126
    label_height = 30
    source_label_x = sx - label_width - 42
    source_label_y = sy - 54 if show_district else sy - 48
    parts.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="10" fill="#ef4444" stroke="#7f1d1d" stroke-width="3" />')
    parts.append(
        f'<line x1="{sx - 8:.1f}" y1="{sy - 8:.1f}" '
        f'x2="{source_label_x + label_width:.1f}" y2="{source_label_y + label_height / 2:.1f}" '
        'stroke="#7f1d1d" stroke-width="2" stroke-linecap="round" />'
    )
    parts.append(
        f'<rect x="{source_label_x:.1f}" y="{source_label_y:.1f}" '
        f'width="{label_width}" height="{label_height}" rx="15" '
        'fill="#fff1f2" stroke="#ef4444" stroke-width="2" />'
    )
    parts.append(
        f'<text x="{source_label_x + label_width / 2:.1f}" y="{source_label_y + 20:.1f}" '
        'font-size="14" font-weight="900" text-anchor="middle" fill="#7f1d1d">report location</text>'
    )

    metric_cards = "".join(
        f'<div class="metric"><strong>{label}</strong><span>{value}</span></div>'
        for label, value in summary["metrics"].items()
    )
    legend_items = "".join(
        f'<span><span class="swatch" style="{style}"></span>{label}</span>'
        for label, style in summary["legend"].items()
    )
    result_items = "".join(
        f'<li><span>{item}</span></li>'
        for item in summary["judge_notes"]
    )
    summary_json = json.dumps(summary["raw"], indent=2)
    output_path.write_text(
        f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    :root {{ color-scheme: light; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
      color: #0f172a;
      background: #eef6f3;
    }}
    main {{ padding: 34px; max-width: 1500px; margin: 0 auto; }}
    h1 {{ font-size: 34px; line-height: 1.05; margin: 0 0 8px; letter-spacing: 0; }}
    .subtitle {{ margin: 0 0 22px; color: #475569; font-size: 17px; max-width: 880px; }}
    .wrap {{ display: grid; grid-template-columns: minmax(0, 1fr) 410px; gap: 22px; align-items: start; }}
    .map-card, .panel {{
      background: rgba(255,255,255,0.9);
      border: 1px solid rgba(148,163,184,0.35);
      border-radius: 18px;
      box-shadow: 0 20px 45px rgba(15,23,42,0.12);
      overflow: hidden;
    }}
    svg {{ width: 100%; height: auto; display: block; background: #ecfeff; }}
    .panel {{ padding: 20px; }}
    .metrics {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }}
    .metric {{ border: 1px solid #dbeafe; border-radius: 12px; padding: 11px; background: #f8fafc; }}
    .metric strong {{ display: block; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: .08em; }}
    .metric span {{ display: block; margin-top: 5px; font-size: 22px; font-weight: 850; color: #0f172a; }}
    .panel h2 {{ font-size: 15px; margin: 16px 0 8px; color: #334155; }}
    ul {{ padding-left: 18px; margin: 0; color: #334155; line-height: 1.42; }}
    li {{ margin: 7px 0; }}
    details {{ margin-top: 18px; }}
    summary {{ cursor: pointer; color: #2563eb; font-weight: 700; }}
    pre {{ white-space: pre-wrap; background: #0f172a; color: #e2e8f0; padding: 14px; border-radius: 12px; font-size: 12px; max-height: 290px; overflow: auto; }}
    .legend {{ display: flex; flex-wrap: wrap; gap: 10px 16px; margin: 10px 0 20px; font-size: 14px; color: #334155; }}
    .swatch {{ display: inline-block; width: 16px; height: 16px; margin-right: 7px; vertical-align: -3px; border: 1px solid #64748b; border-radius: 4px; }}
  </style>
</head>
<body>
  <main>
    <h1>{title}</h1>
    <p class="subtitle">{subtitle}</p>
    <div class="legend">{legend_items}</div>
    <div class="wrap">
      <section class="map-card">
        <svg viewBox="0 0 {WIDTH} {HEIGHT}">
          {''.join(parts)}
        </svg>
      </section>
      <aside class="panel">
        <div class="metrics">{metric_cards}</div>
        <h2>What this proves</h2>
        <ul>{result_items}</ul>
        <details>
          <summary>Raw simulation output</summary>
          <pre>{summary_json}</pre>
        </details>
      </aside>
    </div>
  </main>
</body>
</html>
""",
        encoding="utf-8",
    )


def main() -> None:
    boundary = simulate_boundary()
    irrigation = simulate_irrigation()
    wind = simulate_wind()

    boundary_expected = {"A", "B", "C", "D", "E", "H"}
    boundary_actual = {item["field_id"] for item in boundary}
    if boundary_actual != boundary_expected:
        raise SystemExit(f"Boundary simulation mismatch: {sorted(boundary_actual)}")

    irrigation_expected = {"A", "B", "C", "D", "E", "G", "H"}
    irrigation_actual = {item["field_id"] for item in irrigation}
    if irrigation_actual != irrigation_expected:
        raise SystemExit(f"Irrigation simulation mismatch: {sorted(irrigation_actual)}")

    wind_expected = {"A", "J", "K", "L"}
    wind_actual = {item["field_id"] for item in wind}
    if wind_actual != wind_expected:
        raise SystemExit(f"Wind simulation mismatch: {sorted(wind_actual)}")

    render(
        "Custom Boundary Multi-Hop Simulation",
        "Boundary adjacency follows same-crop fields outward in discrete hops, while filtering unrelated crops and fields beyond the hop gap.",
        boundary_actual,
        {
            "metrics": {
                "Hop radius": f"{ADJACENCY_HOP_MILES} mi",
                "Reached fields": len(boundary_actual),
                "Max hops": max(item["hops"] for item in boundary),
                "Unaffected fields": 3,
            },
            "legend": {
                "reached by boundary hops": "background:#2563eb",
                "same crop but not reached": "background:#f8fafc",
                "unaffected crop": "background:#fde68a",
                "report location": "background:#ef4444",
            },
            "judge_notes": [
                "A reaches B, then C, then D, then E through boundary hops.",
                "H is also reached from A.",
                "F is corn, which is not listed as vulnerable for this pest.",
                "G is almonds but separated by a gap larger than the hop distance.",
                "I is almonds but too far from the boundary chain.",
            ],
            "reached": boundary,
            "raw": {
                "adjacency_hop_miles": ADJACENCY_HOP_MILES,
                "expected_reached_ids": sorted(boundary_expected),
                "reached": boundary,
            },
        },
        BOUNDARY_OUTPUT,
        fields=BASE_FIELDS,
        show_district=False,
    )
    render(
        "Custom Irrigation District Simulation",
        "Irrigation water spread alerts same-crop fields in the shared district and weights risk by distance from the report location.",
        irrigation_actual,
        {
            "metrics": {
                "District radius": f"{IRRIGATION_RADIUS_MILES} mi",
                "Alerted fields": len(irrigation_actual),
                "Highest risk": max(item["risk_score"] for item in irrigation),
                "Unaffected fields": 2,
            },
            "legend": {
                "water alert in same district": "background:#0e7490",
                "same crop outside district": "background:#e5e7eb; border-style:dashed",
                "unaffected crop": "background:#fde68a",
                "irrigation district": "background:#cffafe; border-color:#0891b2",
                "report location": "background:#ef4444",
            },
            "judge_notes": [
                "All almond fields inside the custom irrigation district/radius alert.",
                "Risk is weighted by center distance from the report location.",
                "F is in the district but corn, which is not listed as vulnerable for this pest.",
                "I is almonds but outside the irrigation district, so it is filtered out.",
            ],
            "raw": {
                "irrigation_radius_miles": IRRIGATION_RADIUS_MILES,
                "expected_alert_ids": sorted(irrigation_expected),
                "alerts": irrigation,
            },
        },
        IRRIGATION_OUTPUT,
        fields=BASE_FIELDS,
        show_district=True,
    )
    render(
        "Custom Wind Cone Simulation",
        "Wind spread uses a soft forward cone: fields closer to the centerline score higher, sidewind fields fade out, and upwind fields are ignored.",
        wind_actual,
        {
            "metrics": {
                "Wind direction": "135 deg",
                "Wind speed": f"{WIND_SPEED_MPH} mph",
                "Travel radius": f"{WIND_TRAVEL_MILES} mi",
                "Alerted fields": len(wind_actual),
            },
            "legend": {
                "wind alert": "background:#3b82f6",
                "same crop outside cone": "background:#e5e7eb; border-style:dashed",
                "unaffected crop": "background:#fde68a",
                "wind cone": "background:#bfdbfe; border-color:#2563eb",
                "report location": "background:#ef4444",
            },
            "judge_notes": [
                "J is directly downwind from the report location and scores highest.",
                "K and L are within the soft cone and score lower as angle/distance increase.",
                "M is sidewind and N is upwind, so they do not alert.",
                "F is corn, which is not listed as vulnerable for this pest.",
            ],
            "raw": {
                "wind_direction_degrees": WIND_DIRECTION_DEGREES,
                "wind_speed_mph": WIND_SPEED_MPH,
                "wind_travel_miles": WIND_TRAVEL_MILES,
                "expected_alert_ids": sorted(wind_expected),
                "alerts": wind,
            },
        },
        WIND_OUTPUT,
        fields=WIND_FIELDS,
        show_district=False,
        show_wind=True,
    )

    print(
        json.dumps(
            {
                "boundary_visual": str(BOUNDARY_OUTPUT.resolve()),
                "irrigation_visual": str(IRRIGATION_OUTPUT.resolve()),
                "wind_visual": str(WIND_OUTPUT.resolve()),
                "boundary_reached_ids": sorted(boundary_actual),
                "irrigation_alert_ids": sorted(irrigation_actual),
                "wind_alert_ids": sorted(wind_actual),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
