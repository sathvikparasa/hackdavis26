import argparse
import json
import mimetypes
import uuid
from pathlib import Path
from urllib import error, request


DEFAULT_API_URL = "http://127.0.0.1:8000/analysis"
DEFAULT_IMAGE_PATH = Path(__file__).parent / "fixtures" / "test_pest.png"


def build_multipart_body(fields: dict[str, str], file_path: Path) -> tuple[bytes, str]:
    boundary = f"----yologuard-{uuid.uuid4().hex}"
    mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    body = bytearray()

    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(f"{value}\r\n".encode())

    body.extend(f"--{boundary}\r\n".encode())
    body.extend(
        (
            f'Content-Disposition: form-data; name="image"; filename="{file_path.name}"\r\n'
            f"Content-Type: {mime_type}\r\n\r\n"
        ).encode()
    )
    body.extend(file_path.read_bytes())
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())

    return bytes(body), boundary


def call_analysis_api(
    api_url: str,
    image_path: Path,
    crop_type: str,
    latitude: float | None,
    longitude: float | None,
) -> dict:
    fields = {"crop_type": crop_type}

    if latitude is not None:
        fields["latitude"] = str(latitude)
    if longitude is not None:
        fields["longitude"] = str(longitude)

    body, boundary = build_multipart_body(fields, image_path)
    api_request = request.Request(
        api_url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )

    with request.urlopen(api_request, timeout=120) as response:
        return json.loads(response.read().decode())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Call the local YoloGuard analysis API.")
    parser.add_argument("--url", default=DEFAULT_API_URL, help="Analysis endpoint URL.")
    parser.add_argument("--image", type=Path, default=DEFAULT_IMAGE_PATH, help="Pest image path.")
    parser.add_argument("--crop-type", default="almond", help="Crop type for the report.")
    parser.add_argument("--latitude", type=float, default=None, help="Optional report latitude.")
    parser.add_argument("--longitude", type=float, default=None, help="Optional report longitude.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    image_path = args.image.expanduser().resolve()

    if not image_path.exists():
        raise SystemExit(f"Image not found: {image_path}")

    try:
        result = call_analysis_api(
            api_url=args.url,
            image_path=image_path,
            crop_type=args.crop_type,
            latitude=args.latitude,
            longitude=args.longitude,
        )
    except error.HTTPError as exc:
        details = exc.read().decode()
        raise SystemExit(f"API returned {exc.code}: {details}") from exc

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
