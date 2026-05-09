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


def calculate_spread(request: SpreadRequest) -> SpreadResponse:
    weather = None
    if SpreadMethod.wind in request.analysis.spread_methods:
        weather = get_current_weather(
            request.source.latitude,
            request.source.longitude,
        )

    alerts = [
        alert
        for field in request.fields
        if (
            alert := _score_field(
                request=request,
                field=field,
                wind_direction=weather.wind_direction_10m if weather else None,
                wind_speed=weather.wind_speed_10m if weather else None,
            )
        )
        is not None
    ]
    alerts.sort(key=lambda alert: alert.risk_score, reverse=True)

    return SpreadResponse(
        pest_name=request.analysis.pest_name,
        alerts=alerts,
    )


def _score_field(
    request: SpreadRequest,
    field: CandidateField,
    wind_direction: float | None,
    wind_speed: float | None,
) -> FieldAlert | None:
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

    if SpreadMethod.adjacency in request.analysis.spread_methods:
        adjacency_score = _proximity_score(distance, travel_distance)
        if adjacency_score > 0:
            matched_methods.append(SpreadMethod.adjacency)
            score_parts.append(adjacency_score)
            reasons.append("Field is within the pest travel distance")

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

    crop_bonus = 0.1 if field.crop_type.lower() == request.source.crop_type.lower() else 0
    confidence_weight = max(0, min(request.analysis.confidence, 1))
    risk_score = min(1, (max(score_parts) * confidence_weight) + crop_bonus)

    if crop_bonus:
        reasons.append("Field crop matches the detection crop")

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
