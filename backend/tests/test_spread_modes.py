import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import (  # noqa: E402
    CandidateField,
    SpreadAnalysis,
    SpreadMethod,
    SpreadRequest,
    SpreadSource,
    VulnerableCrop,
)
from app.services.spread import ADJACENCY_HOP_DISTANCE_MILES, calculate_spread  # noqa: E402


SOURCE = SpreadSource(latitude=38.5373442625, longitude=-121.799287157687, crop_type="almond")


def _analysis(*methods: SpreadMethod, travel_distance: float = 1.0) -> SpreadAnalysis:
    return SpreadAnalysis(
        spread_methods=list(methods),
        vulnerable_crop=[
            VulnerableCrop(
                crop_type="almonds",
                damage_type="test damage",
                duration=7,
                recommendations="test recommendation",
            )
        ],
        travel_distance=travel_distance,
        pest_name="Test Pest",
        confidence=0.9,
    )


def _field(
    field_id: str,
    latitude: float,
    longitude: float,
    crop_type: str = "almonds",
) -> CandidateField:
    return CandidateField(
        id=field_id,
        name=f"Field {field_id}",
        crop_type=crop_type,
        latitude=latitude,
        longitude=longitude,
    )


class SpreadModeTests(unittest.TestCase):
    def test_adjacency_alerts_same_crop_near_source(self) -> None:
        request = SpreadRequest(
            source=SOURCE,
            analysis=_analysis(SpreadMethod.adjacency, travel_distance=0.5),
            fields=[
                _field(
                    "5262",
                    latitude=SOURCE.latitude,
                    longitude=SOURCE.longitude,
                    crop_type="almonds",
                )
            ],
        )

        response = calculate_spread(request)

        self.assertEqual(len(response.alerts), 1)
        self.assertEqual(response.alerts[0].field_id, "5262")
        self.assertEqual(response.alerts[0].matched_methods, [SpreadMethod.adjacency])
        self.assertEqual(response.alerts[0].distance, 0)

    def test_adjacency_uses_two_mile_hop_distance(self) -> None:
        request = SpreadRequest(
            source=SOURCE,
            analysis=_analysis(SpreadMethod.adjacency, travel_distance=0.1),
            fields=[
                _field(
                    "hop-distance-almond",
                    latitude=SOURCE.latitude + (ADJACENCY_HOP_DISTANCE_MILES * 0.75 / 69),
                    longitude=SOURCE.longitude,
                    crop_type="almonds",
                )
            ],
        )

        response = calculate_spread(request)

        self.assertEqual(len(response.alerts), 1)
        self.assertEqual(response.alerts[0].field_id, "hop-distance-almond")
        self.assertEqual(response.alerts[0].matched_methods, [SpreadMethod.adjacency])

    def test_wind_alerts_downwind_field(self) -> None:
        request = SpreadRequest(
            source=SOURCE,
            analysis=_analysis(SpreadMethod.wind, travel_distance=2),
            fields=[
                _field(
                    "north-field",
                    latitude=SOURCE.latitude + 0.01,
                    longitude=SOURCE.longitude,
                )
            ],
        )

        with patch(
            "app.services.spread.get_current_weather",
            return_value=SimpleNamespace(wind_direction_10m=0, wind_speed_10m=20),
        ):
            response = calculate_spread(request)

        self.assertEqual(len(response.alerts), 1)
        self.assertEqual(response.alerts[0].field_id, "north-field")
        self.assertEqual(response.alerts[0].matched_methods, [SpreadMethod.wind])
        self.assertGreater(response.alerts[0].risk_score, 0)

    def test_non_vulnerable_crop_does_not_alert(self) -> None:
        request = SpreadRequest(
            source=SOURCE,
            analysis=_analysis(SpreadMethod.adjacency, travel_distance=0.5),
            fields=[
                _field(
                    "corn-field",
                    latitude=SOURCE.latitude,
                    longitude=SOURCE.longitude,
                    crop_type="corn",
                )
            ],
        )

        response = calculate_spread(request)

        self.assertEqual(response.alerts, [])


if __name__ == "__main__":
    unittest.main()
