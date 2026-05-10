from app.models import AnalysisRequest, WeatherContext
from app.services.weather import get_current_weather


def get_report_weather_context(request: AnalysisRequest) -> WeatherContext:
    return get_current_weather(
        request.location.latitude,
        request.location.longitude,
    )
