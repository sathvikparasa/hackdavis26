import argparse
import json
import sys
from pathlib import Path
from urllib import error, request

sys.path.insert(0, str(Path(__file__).resolve().parent))

from call_analysis_api import DEFAULT_IMAGE_PATH, build_multipart_body


DEFAULT_API_URL = "http://127.0.0.1:8000/reports"


def call_reports_api(
    api_url: str,
    image_path: Path,
    crop_type: str,
    latitude: float,
    longitude: float,
    reporter_user_id: str | None,
) -> dict:
    fields = {
        "crop_type": crop_type,
        "latitude": str(latitude),
        "longitude": str(longitude),
    }
    if reporter_user_id:
        fields["reporter_user_id"] = reporter_user_id

    body, boundary = build_multipart_body(fields, image_path)
    api_request = request.Request(
        api_url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )

    with request.urlopen(api_request, timeout=180) as response:
        return json.loads(response.read().decode())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Call the local YoloGuard reports API.")
    parser.add_argument("--url", default=DEFAULT_API_URL, help="Reports endpoint URL.")
    parser.add_argument("--image", type=Path, default=DEFAULT_IMAGE_PATH, help="Pest image path.")
    parser.add_argument("--crop-type", default="almond", help="Crop type for the report.")
    parser.add_argument("--latitude", type=float, required=True, help="Report latitude.")
    parser.add_argument("--longitude", type=float, required=True, help="Report longitude.")
    parser.add_argument("--reporter-user-id", default=None, help="Optional Clerk user id.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    image_path = args.image.expanduser().resolve()

    if not image_path.exists():
        raise SystemExit(f"Image not found: {image_path}")

    try:
        result = call_reports_api(
            api_url=args.url,
            image_path=image_path,
            crop_type=args.crop_type,
            latitude=args.latitude,
            longitude=args.longitude,
            reporter_user_id=args.reporter_user_id,
        )
    except error.HTTPError as exc:
        details = exc.read().decode()
        raise SystemExit(f"API returned {exc.code}: {details}") from exc

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
