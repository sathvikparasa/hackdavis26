import asyncio
import logging
import os
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile

from app.models import (
    AnalysisRequest,
    AnalysisResponse,
    RecomputeAllAffectedFieldsResponse,
    RecomputeFarmerFieldsRequest,
    RecomputeFarmerFieldsResponse,
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
from app.services.reports import recompute_farmer_field_alerts as recompute_farmer_field_alerts_service
from app.services.reports import repopulate_all_affected_fields as repopulate_all_affected_fields_service
from app.services.spread import calculate_spread as calculate_spread_service


_log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=_log_level,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logging.getLogger().setLevel(_log_level)

app = FastAPI(title="YoloGuard API")


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


@app.post("/farmer-fields/recompute-alerts", response_model=RecomputeFarmerFieldsResponse)
def recompute_farmer_field_alerts(
    request: RecomputeFarmerFieldsRequest,
) -> RecomputeFarmerFieldsResponse:
    return recompute_farmer_field_alerts_service(
        reporter_user_id=request.reporter_user_id,
        field_id=request.field_id,
        field_ids=request.field_ids,
        send_notifications=request.send_notifications,
    )


@app.post("/alerts/repopulate-affected-fields", response_model=RecomputeAllAffectedFieldsResponse)
async def repopulate_affected_fields() -> RecomputeAllAffectedFieldsResponse:
    return await asyncio.to_thread(repopulate_all_affected_fields_service)


@app.get("/cron/repopulate-affected-fields", response_model=RecomputeAllAffectedFieldsResponse)
async def cron_repopulate_affected_fields() -> RecomputeAllAffectedFieldsResponse:
    return await asyncio.to_thread(repopulate_all_affected_fields_service)


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
