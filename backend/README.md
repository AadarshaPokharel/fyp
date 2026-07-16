# Backend (FastAPI)

Backend API for authentication, user management, event analytics, downloads, and ML prediction.

## Main Responsibilities

- JWT auth (`/auth/*`)
- Role-based access (`admin`, `policy_maker`)
- IoT event and stats APIs (`/events/*`)
- Prediction APIs (`/predict`, `/predictions`)
- Download request workflow (`/downloads/*`)
- Audit logging

## Run

```bash
# cd /home/aadarsha/fyp/backend
./venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## API Docs

- Swagger: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`

## Required Environment Variables

Set in `backend/.env`:

- `MONGO_URI`
- `MONGO_DB`
- `SECRET_KEY`
- `MODEL_PATH`
- `FRONTEND_URL`
- SMTP values for password emails (optional but recommended)

## Important Files

- `app/main.py` - app setup and middleware
- `app/routes/` - API endpoints
- `app/services/` - business logic
- `app/core/auth.py` - auth and JWT helpers
- `app/routes/predict.py` - model loading and inference

## Prediction Notes

- Backend reads model from `MODEL_PATH` in `.env`.
- `POST /predict/` returns:
  - `source` (`ml_model` or `rule_fallback`)
  - `model_loaded` (`true`/`false`)
- If model bundle is missing/invalid, API gracefully falls back to rule-based prediction.
