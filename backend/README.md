# YoloGuard Backend

FastAPI skeleton for the MVP backend.

## Local Development

```bash
uv sync
uv run uvicorn api.index:app --reload
```

Copy values into `.env` before running the analysis endpoint.

## Routes

- `GET /health`
- `POST /reports`
- `POST /analysis`
- `POST /spread`

`POST /reports` uploads the image to Supabase Storage, runs analysis, scores spread risk, and stores report rows.
`POST /analysis` wires the Gemini and Supabase IPM search flow.

`POST /analysis` now accepts multipart form data:

- `image`: uploaded pest image file
- `crop_type`: crop where the pest was detected
- `latitude`: optional detection latitude
- `longitude`: optional detection longitude

`POST /reports` accepts multipart form data:

- `image`: uploaded pest image file
- `crop_type`: crop where the pest was detected
- `latitude`: report latitude
- `longitude`: report longitude
- `reporter_user_id`: optional Clerk user id

## Layout

- `api/index.py`: FastAPI route declarations.
- `app/models.py`: shared Pydantic schemas.
- `app/config.py`: environment settings scaffold.
- `app/services/analysis.py`: report analysis service entrypoint.
- `app/services/gemini.py`: Gemini agentic IPM tool loops for pest ID and structured analysis.
- `app/services/ipm_search.py`: Supabase vector search with Google embeddings.
- `app/services/spread.py`: future spread scoring integration.

## Test Caller

With the server running, place a real pest image at `tests/fixtures/test_pest.png` and run:

```bash
uv run python tests/call_analysis_api.py --crop-type almond
```

From the repo root:

```bash
uv run --project backend python tests/call_analysis_api.py --crop-type almond
```

To test image upload plus report persistence:

```bash
uv run python tests/call_reports_api.py --crop-type almond --latitude 38.54 --longitude -121.73
```
