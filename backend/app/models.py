from enum import Enum
from typing import List

from pydantic import BaseModel, Field


class SpreadMethod(str, Enum):
    wind = "wind"
    water = "water"
    adjacency = "adjacency"


class VulnerableCrop(BaseModel):
    damage_type: str = Field(..., examples=["leaf damage"])
    duration: int = Field(..., examples=[7])
    recommendations: str = Field(..., examples=["Monitor nearby fields."])


class AnalysisResponse(BaseModel):
    spread_methods: List[SpreadMethod]
    vulnerable_crop: List[VulnerableCrop]
    travel_distance: float
    pest_name: str
    confidence: float


class StatusResponse(BaseModel):
    status: str
