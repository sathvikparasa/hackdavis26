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

## Layout

- `api/index.py`: FastAPI route declarations.
- `app/models.py`: shared Pydantic schemas.
- `app/config.py`: environment settings scaffold.
- `app/services/analysis.py`: report analysis service entrypoint.
- `app/services/gemini.py`: future Gemini integration.
- `app/services/ipm_search.py`: future Supabase vector search integration.
- `app/services/spread.py`: future spread scoring integration.
