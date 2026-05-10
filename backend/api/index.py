from typing import Optional
import logging
import sys
import time

from fastapi import FastAPI, File, Form, Request, UploadFile

from app.models import (
    AnalysisRequest,
    AnalysisResponse,
    ReportResponse,
    SpreadRequest,
    SpreadResponse,
    StatusResponse,
    WeatherContext,
)
from app.services.analysis import analyze_report as analyze_report_service
from app.services.weather_analysis import (
    get_report_weather_context as get_report_weather_context_service,
)
from app.services.reports import submit_report as submit_report_service
from app.services.spread import calculate_spread as calculate_spread_service


app = FastAPI(title="YoloGuard API")
logger = logging.getLogger("yologuard.timing")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))
    logger.addHandler(handler)
logger.propagate = False


@app.middleware("http")
async def log_request_timing(request: Request, call_next):
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.exception(
            "request failed method=%s path=%s duration_ms=%.1f",
            request.method,
            request.url.path,
            elapsed_ms,
        )
        raise

    elapsed_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "request method=%s path=%s status=%s duration_ms=%.1f",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.get("/health")
def health() -> StatusResponse:
    return {"status": "ok"}


@app.post("/reports", response_model=ReportResponse)
async def submit_report(
    image: UploadFile = File(...),
    crop_type: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    reporter_user_id: Optional[str] = Form(None),
) -> ReportResponse:
    image_bytes = await image.read()
    return submit_report_service(
        image_bytes=image_bytes,
        mime_type=image.content_type or "application/octet-stream",
        filename=image.filename or "report-image",
        crop_type=crop_type,
        latitude=latitude,
        longitude=longitude,
        reporter_user_id=reporter_user_id,
    )


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


@app.post("/weather/analysis", response_model=WeatherContext)
def get_report_weather_context(request: AnalysisRequest) -> WeatherContext:
    return get_report_weather_context_service(request)


@app.post("/spread", response_model=SpreadResponse)
def calculate_spread(request: SpreadRequest) -> SpreadResponse:
    return calculate_spread_service(request)
