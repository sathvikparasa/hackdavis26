from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile

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
async def analyze_report(
    image: UploadFile = File(...),
    crop_type: str = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
) -> AnalysisResponse:
    image_bytes = await image.read()
    return analyze_report_service(
        image_bytes=image_bytes,
        mime_type=image.content_type or "application/octet-stream",
        crop_type=crop_type,
        latitude=latitude,
        longitude=longitude,
    )


@app.post("/spread")
def calculate_spread() -> StatusResponse:
    return calculate_spread_service()
