import logging
import re
from dataclasses import dataclass
from math import asin, atan2, cos, degrees, radians, sin, sqrt

from app.models import (
    AlertSeverity,
    CandidateField,
    FieldAlert,
    SpreadMethod,
    SpreadRequest,
    SpreadResponse,
)
from app.services.weather import get_current_weather


EARTH_RADIUS_MILES = 3958.8
DEFAULT_TRAVEL_DISTANCE_MILES = 1.0
ADJACENCY_HOP_DISTANCE_MILES = 2.0

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _AdjacencyMatch:
    trigger_distance: float
    source_distance: float
    hops: int


def calculate_spread(request: SpreadRequest) -> SpreadResponse:
    logger.info(
        "Calculating spread pest=%s methods=%s fields=%s travel_distance=%s adjacency_hop_miles=%s",
        request.analysis.pest_name,
        [method.value for method in request.analysis.spread_methods],
        len(request.fields),
        request.analysis.travel_distance,
        ADJACENCY_HOP_DISTANCE_MILES,
    )

    weather = None
    if SpreadMethod.wind in request.analysis.spread_methods:
        weather = get_current_weather(
            request.source.latitude,
            request.source.longitude,
        )

    adjacency_matches = _build_adjacency_matches(request)
    if SpreadMethod.adjacency in request.analysis.spread_methods:
        logger.info("Matched %s adjacency field(s)", len(adjacency_matches))

    alerts = [
        alert
        for field in request.fields
        if (
            alert := _score_field(
                request=request,
                field=field,
                wind_direction=weather.wind_direction_10m if weather else None,
                wind_speed=weather.wind_speed_10m if weather else None,
                adjacency_match=adjacency_matches.get(field.id),
            )
        )
        is not None
    ]
    alerts.sort(key=lambda alert: alert.risk_score, reverse=True)
    logger.info("Spread produced %s alert(s)", len(alerts))

    return SpreadResponse(
        pest_name=request.analysis.pest_name,
        alerts=alerts,
    )


def _score_field(
    request: SpreadRequest,
    field: CandidateField,
    wind_direction: float | None,
    wind_speed: float | None,
    adjacency_match: _AdjacencyMatch | None,
) -> FieldAlert | None:
    affected_crops = _affected_crop_keys(request)
    crop_key = _crop_key(field.crop_type)
    crop_matches_pest = crop_key in affected_crops
    if not crop_matches_pest:
        return None

    distance = _distance_miles(
        request.source.longitude,
        request.source.latitude,
        field.longitude,
        field.latitude,
    )
    travel_distance = request.analysis.travel_distance or DEFAULT_TRAVEL_DISTANCE_MILES

    matched_methods: list[SpreadMethod] = []
    reasons: list[str] = []
    score_parts: list[float] = []

    if SpreadMethod.adjacency in request.analysis.spread_methods and adjacency_match:
        adjacency_score = _adjacency_score(adjacency_match=adjacency_match)
        matched_methods.append(SpreadMethod.adjacency)
        score_parts.append(adjacency_score)
        reasons.append(
            "Field crop is vulnerable and reachable by adjacency "
            f"in {adjacency_match.hops} hop(s)"
        )

    if SpreadMethod.wind in request.analysis.spread_methods and wind_direction is not None:
        wind_score = _wind_score(
            source_lon=request.source.longitude,
            source_lat=request.source.latitude,
            target_lon=field.longitude,
            target_lat=field.latitude,
            wind_direction=wind_direction,
            wind_speed=wind_speed or 0,
            distance=distance,
            travel_distance=travel_distance,
        )
        if wind_score > 0:
            matched_methods.append(SpreadMethod.wind)
            score_parts.append(wind_score)
            reasons.append("Field is aligned with current wind conditions")

    if not score_parts:
        return None

    crop_bonus = 0.1 if _crop_key(field.crop_type) == _crop_key(request.source.crop_type) else 0
    confidence_weight = max(0, min(request.analysis.confidence, 1))
    risk_score = min(1, (max(score_parts) * confidence_weight) + crop_bonus)

    if crop_bonus:
        reasons.append("Field crop matches the detection crop")
    elif crop_matches_pest:
        reasons.append("Field crop is listed as vulnerable to this pest")

    return FieldAlert(
        field_id=field.id,
        field_name=field.name,
        crop_type=field.crop_type,
        risk_score=round(risk_score, 3),
        severity=_severity_for_score(risk_score),
        distance=round(distance, 3),
        matched_methods=matched_methods,
        reasons=reasons,
    )


def _distance_miles(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return EARTH_RADIUS_MILES * 2 * asin(sqrt(a))


def _bearing_degrees(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    dlon = radians(lon2 - lon1)
    y = sin(dlon) * cos(radians(lat2))
    x = (
        cos(radians(lat1)) * sin(radians(lat2))
        - sin(radians(lat1)) * cos(radians(lat2)) * cos(dlon)
    )
    return (degrees(atan2(y, x)) + 360) % 360


def _proximity_score(distance: float, travel_distance: float) -> float:
    if travel_distance <= 0 or distance > travel_distance:
        return 0
    return max(0, 1 - (distance / travel_distance))


def _affected_crop_keys(request: SpreadRequest) -> set[str]:
    crops = {_crop_key(request.source.crop_type)}
    crops.update(_crop_key(crop.crop_type) for crop in request.analysis.vulnerable_crop)
    return {crop for crop in crops if crop}


def _build_adjacency_matches(request: SpreadRequest) -> dict[str, _AdjacencyMatch]:
    if SpreadMethod.adjacency not in request.analysis.spread_methods:
        return {}

    affected_crops = _affected_crop_keys(request)
    unvisited = {
        field.id: field
        for field in request.fields
        if _crop_key(field.crop_type) in affected_crops
    }
    matches: dict[str, _AdjacencyMatch] = {}
    frontier: list[tuple[float, float, int]] = [
        (request.source.longitude, request.source.latitude, 0)
    ]
    logger.info(
        "Building adjacency matches vulnerable_fields=%s hop_miles=%s",
        len(unvisited),
        ADJACENCY_HOP_DISTANCE_MILES,
    )

    while frontier and unvisited:
        next_frontier: list[tuple[float, float, int]] = []

        for origin_lon, origin_lat, hops in frontier:
            reached_ids: list[str] = []
            for field_id, field in unvisited.items():
                trigger_distance = _distance_miles(
                    origin_lon,
                    origin_lat,
                    field.longitude,
                    field.latitude,
                )
                if trigger_distance > ADJACENCY_HOP_DISTANCE_MILES:
                    continue

                source_distance = _source_distance(request, field)
                matches[field_id] = _AdjacencyMatch(
                    trigger_distance=trigger_distance,
                    source_distance=source_distance,
                    hops=hops + 1,
                )
                next_frontier.append((field.longitude, field.latitude, hops + 1))
                reached_ids.append(field_id)

            for field_id in reached_ids:
                unvisited.pop(field_id, None)

        frontier = next_frontier

    return matches


def _adjacency_score(
    adjacency_match: _AdjacencyMatch,
) -> float:
    hop_score = _proximity_score(
        adjacency_match.trigger_distance,
        ADJACENCY_HOP_DISTANCE_MILES,
    )
    hop_penalty = 0.85 ** max(adjacency_match.hops - 1, 0)
    return max(0.05, hop_score * hop_penalty)


def _source_distance(request: SpreadRequest, field: CandidateField) -> float:
    return _distance_miles(
        request.source.longitude,
        request.source.latitude,
        field.longitude,
        field.latitude,
    )


def _crop_key(crop_type: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", crop_type.lower()).strip()
    words = []
    for word in normalized.split():
        if len(word) > 3 and word.endswith("s"):
            word = word[:-1]
        words.append(word)
    return " ".join(words)


def _wind_score(
    source_lon: float,
    source_lat: float,
    target_lon: float,
    target_lat: float,
    wind_direction: float,
    wind_speed: float,
    distance: float,
    travel_distance: float,
) -> float:
    target_bearing = _bearing_degrees(source_lon, source_lat, target_lon, target_lat)
    angle_diff = abs(target_bearing - wind_direction) % 360
    if angle_diff > 180:
        angle_diff = 360 - angle_diff

    alignment_score = max(0, cos(radians(angle_diff)))
    distance_score = _proximity_score(distance, max(travel_distance, DEFAULT_TRAVEL_DISTANCE_MILES))
    speed_score = min(max(wind_speed, 0) / 20, 1)

    return alignment_score * distance_score * max(speed_score, 0.2)


def _severity_for_score(score: float) -> AlertSeverity:
    if score >= 0.7:
        return AlertSeverity.high
    if score >= 0.35:
        return AlertSeverity.medium
    return AlertSeverity.low
