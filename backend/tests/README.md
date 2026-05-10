# Backend Tests

Start the API from `backend/`:

```bash
uv run uvicorn api.index:app --reload
```

Place a real pest image at `tests/fixtures/test_pest.png`, then call:

```bash
uv run python tests/call_analysis_api.py --crop-type almond
```

Or pass any image path:

```bash
uv run python tests/call_analysis_api.py --image /path/to/pest.jpg --crop-type tomato --latitude 38.54 --longitude -121.73
```

From the repo root, use:

```bash
uv run --project backend python tests/call_analysis_api.py --crop-type almond
```

To test the full report persistence flow:

```bash
uv run python tests/call_reports_api.py --crop-type almond --latitude 38.54 --longitude -121.73
```
