from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class SpreadMethod(str, Enum):
    wind = "wind"
    water = "water"
    adjacency = "adjacency"


class VulnerableCrop(BaseModel):
    crop_type: str
    damage_type: str
    duration: int
    recommendations: str


class Location(BaseModel):
    latitude: float = Field(..., ge=-90, le=90, examples=[38.5449])
    longitude: float = Field(..., ge=-180, le=180, examples=[-121.7405])


class AnalysisRequest(BaseModel):
    image_url: str | None = Field(
        default=None,
        examples=["https://example.com/pest-image.jpg"],
    )
    image_base64: str | None = Field(default=None)
    location: Location
    crop_type: str | None = Field(default=None, examples=["tomato"])


class WeatherContext(BaseModel):
    temperature_2m: float
    relative_humidity_2m: float
    wind_speed_10m: float
    wind_direction_10m: float
    precipitation: float


class AnalysisResponse(BaseModel):
    spread_methods: List[SpreadMethod]
    vulnerable_crop: List[VulnerableCrop]
    travel_distance: float
    pest_name: str
    confidence: float


class SpreadSource(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    crop_type: str


class SpreadAnalysis(BaseModel):
    spread_methods: List[SpreadMethod]
    vulnerable_crop: List[VulnerableCrop] = Field(default_factory=list)
    travel_distance: float
    pest_name: str
    confidence: float


class CandidateField(BaseModel):
    id: str
    name: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    crop_type: str


class AlertSeverity(str, Enum):
    low = "LOW"
    medium = "MEDIUM"
    high = "HIGH"


class SpreadRequest(BaseModel):
    source: SpreadSource
    analysis: SpreadAnalysis
    fields: List[CandidateField]


class FieldAlert(BaseModel):
    field_id: str
    field_name: str
    crop_type: str
    risk_score: float = Field(..., ge=0, le=1)
    severity: AlertSeverity
    distance: float
    matched_methods: List[SpreadMethod]
    reasons: List[str]


class SpreadResponse(BaseModel):
    pest_name: str
    alerts: List[FieldAlert]


class ReportResponse(BaseModel):
    report_id: str
    image_bucket: str
    image_path: str
    analysis: AnalysisResponse
    spread: SpreadResponse


class AnalysisInput(BaseModel):
    image_bytes: bytes
    mime_type: str
    crop_type: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class PestIdentification(BaseModel):
    pest_name: str
    confidence: float = Field(..., ge=0, le=1)


class IpmChunk(BaseModel):
    chunk_id: str
    document: str
    url: Optional[str] = None
    crop: Optional[str] = None
    pest: Optional[str] = None
    section: Optional[str] = None
    similarity: float


class StatusResponse(BaseModel):
    status: str
