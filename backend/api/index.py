from fastapi import FastAPI

from app.models import AnalysisResponse, StatusResponse
from app.services.analysis import analyze_report as analyze_report_service
from app.services.reports import submit_report as submit_report_service
from app.services.spread import calculate_spread as calculate_spread_service


app = FastAPI(title="YoloGuard API")


@app.get("/health")
def health() -> StatusResponse:
    return {"status": "ok"}


@app.post("/reports")
def submit_report() -> StatusResponse:
    return submit_report_service()


@app.post("/analysis", response_model=AnalysisResponse)
def analyze_report() -> AnalysisResponse:
    return analyze_report_service()


@app.post("/spread")
def calculate_spread() -> StatusResponse:
    return calculate_spread_service()
