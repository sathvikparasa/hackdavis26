from enum import Enum
from typing import List

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(title="YoloGuard API")


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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/reports")
def submit_report():
    return {"status": "stub"}


@app.post("/analysis", response_model=AnalysisResponse)
def analyze_report():
    return {
        "spread_methods": [],
        "vulnerable_crop": [],
        "travel_distance": 0,
        "pest_name": "",
        "confidence": 0,
    }


@app.post("/spread")
def calculate_spread():
    return {"status": "stub"}
