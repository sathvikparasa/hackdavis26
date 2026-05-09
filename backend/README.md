# YoloGuard Backend

FastAPI skeleton for the MVP backend.

## Local Development

```bash
pip install -r requirements.txt
uvicorn api.index:app --reload
```

## Routes

- `GET /health`
- `POST /reports`
- `POST /analysis`
- `POST /spread`

The routes are stubs only. Gemini, Supabase, Clerk, weather, and spread logic have not been added yet.
