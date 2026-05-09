from app.models import AnalysisResponse


def analyze_report() -> AnalysisResponse:
    return AnalysisResponse(
        spread_methods=[],
        vulnerable_crop=[],
        travel_distance=0,
        pest_name="",
        confidence=0,
    )
