from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

from app.models import Location, WaterFlowPath


EARTH_RADIUS_MILES = 3958.8
DEFAULT_WATER_TRAVEL_HOURS = 24.0


@dataclass(frozen=True)
class WaterFlowMatch:
    travel_hours: float
    risk_score: float


@dataclass(frozen=True)
class _PathPosition:
    along_miles: float
    snap_distance_miles: float


def score_water_flow(
    source_location: Location,
    farm_location: Location,
    flow_paths: list[WaterFlowPath],
    max_travel_hours: float | None,
) -> WaterFlowMatch | None:
    travel_window = max_travel_hours or DEFAULT_WATER_TRAVEL_HOURS
    best_match = None

    for flow_path in flow_paths:
        source_position = _position_on_path(source_location, flow_path)
        farm_position = _position_on_path(farm_location, flow_path)
        if source_position is None or farm_position is None:
            continue
        if source_position.snap_distance_miles > flow_path.max_snap_distance_miles:
            continue
        if farm_position.snap_distance_miles > flow_path.max_snap_distance_miles:
            continue

        downstream_miles = farm_position.along_miles - source_position.along_miles
        if downstream_miles <= 0:
            continue

        travel_hours = downstream_miles / flow_path.flow_speed_mph
        if travel_hours > travel_window:
            continue

        match = WaterFlowMatch(
            travel_hours=round(travel_hours, 3),
            risk_score=round(1 - (travel_hours / travel_window), 3),
        )
        if best_match is None or match.risk_score > best_match.risk_score:
            best_match = match

    return best_match


def _position_on_path(location: Location, flow_path: WaterFlowPath) -> _PathPosition | None:
    best_position = None
    miles_before_segment = 0.0

    for start, end in zip(flow_path.coordinates, flow_path.coordinates[1:]):
        segment_miles = _distance_miles(start, end)
        if segment_miles == 0:
            continue

        fraction, snap_distance = _project_onto_segment(location, start, end)
        position = _PathPosition(
            along_miles=miles_before_segment + (fraction * segment_miles),
            snap_distance_miles=snap_distance,
        )
        if best_position is None or snap_distance < best_position.snap_distance_miles:
            best_position = position

        miles_before_segment += segment_miles

    return best_position


def _project_onto_segment(
    point: Location,
    start: Location,
    end: Location,
) -> tuple[float, float]:
    point_x, point_y = _to_local_miles(point, start)
    end_x, end_y = _to_local_miles(end, start)
    segment_length_squared = (end_x * end_x) + (end_y * end_y)
    if segment_length_squared == 0:
        return 0, _distance_miles(point, start)

    fraction = ((point_x * end_x) + (point_y * end_y)) / segment_length_squared
    fraction = max(0, min(1, fraction))
    snap_x = point_x - (fraction * end_x)
    snap_y = point_y - (fraction * end_y)
    return fraction, sqrt((snap_x * snap_x) + (snap_y * snap_y))


def _to_local_miles(location: Location, origin: Location) -> tuple[float, float]:
    average_latitude = radians((location.latitude + origin.latitude) / 2)
    x = (
        radians(location.longitude - origin.longitude)
        * EARTH_RADIUS_MILES
        * cos(average_latitude)
    )
    y = radians(location.latitude - origin.latitude) * EARTH_RADIUS_MILES
    return x, y


def _distance_miles(start: Location, end: Location) -> float:
    dlat = radians(end.latitude - start.latitude)
    dlon = radians(end.longitude - start.longitude)
    a = (
        sin(dlat / 2) ** 2
        + cos(radians(start.latitude))
        * cos(radians(end.latitude))
        * sin(dlon / 2) ** 2
    )
    return EARTH_RADIUS_MILES * 2 * asin(sqrt(a))
