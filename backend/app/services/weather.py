import httpx

from app.models import WeatherContext


OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def get_current_weather(latitude: float, longitude: float) -> WeatherContext:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(
            [
                "temperature_2m",
                "relative_humidity_2m",
                "wind_speed_10m",
                "wind_direction_10m",
                "precipitation",
            ]
        ),
    }

    response = httpx.get(OPEN_METEO_FORECAST_URL, params=params, timeout=10)
    response.raise_for_status()

    current = response.json()["current"]
    return WeatherContext(
        temperature_2m=current["temperature_2m"],
        relative_humidity_2m=current["relative_humidity_2m"],
        wind_speed_10m=current["wind_speed_10m"],
        wind_direction_10m=current["wind_direction_10m"],
        precipitation=current["precipitation"],
    )
