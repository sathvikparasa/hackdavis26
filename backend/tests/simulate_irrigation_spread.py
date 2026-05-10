import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import SpreadSource, VulnerableCrop  # noqa: E402
from app.services.irrigation import calculate_irrigation_alerts  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulate irrigation-district water spread.")
    parser.add_argument("--reporter-user-id", required=True)
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--source-crop", default="almond")
    parser.add_argument("--search-radius-miles", type=float, default=10)
    parser.add_argument("--confidence", type=float, default=0.95)
    parser.add_argument("--vulnerable-crop", action="append", default=["almond"])
    parser.add_argument("--expect-field-id", action="append", default=[])
    parser.add_argument("--expect-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    alerts = calculate_irrigation_alerts(
        source=SpreadSource(
            latitude=args.latitude,
            longitude=args.longitude,
            crop_type=args.source_crop,
        ),
        vulnerable_crop=[
            VulnerableCrop(
                crop_type=crop,
                damage_type="simulation",
                duration=1,
                recommendations="simulation",
            )
            for crop in args.vulnerable_crop
        ],
        confidence=args.confidence,
        search_radius_miles=args.search_radius_miles,
        reporter_user_id=args.reporter_user_id,
    )

    reached_ids = {alert.field_id for alert in alerts}
    expected_ids = set(args.expect_field_id)
    missing_ids = sorted(expected_ids - reached_ids)
    unexpected_ids = sorted(reached_ids - expected_ids) if args.expect_only else []
    result = {
        "reporter_user_id": args.reporter_user_id,
        "latitude": args.latitude,
        "longitude": args.longitude,
        "source_crop": args.source_crop,
        "search_radius_miles": args.search_radius_miles,
        "vulnerable_crops": args.vulnerable_crop,
        "alerts": [alert.model_dump(mode="json") for alert in alerts],
        "expected_field_ids": sorted(expected_ids),
        "missing_expected_field_ids": missing_ids,
        "unexpected_field_ids": unexpected_ids,
    }
    print(json.dumps(result, indent=2))

    if missing_ids or unexpected_ids:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
