from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class SpreadMethod(str, Enum):
    wind = "wind"
    water = "water"
    adjacency = "adjacency"


class VulnerableCrop(BaseModel):
    damage_type: str
    duration: int
    recommendations: str


class AnalysisResponse(BaseModel):
    spread_methods: List[SpreadMethod]
    vulnerable_crop: List[VulnerableCrop]
    travel_distance: float
    pest_name: str
    confidence: float


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
