# Frontend (React + Vite)

UI for the IoT Collision Prediction platform.

## Main Features

- Login and password recovery
- Role-based dashboards:
  - `admin`: policy makers, audit logs, CSV request approvals
  - `policy_maker`: live monitor, analysis, interactive prediction
- Profile management and logout
- API integration with backend auth and data services
- Interactive prediction page with presets and model status (`LOADED`/`NOT LOADED`)

## Run

Native:

```bash
npm install
npm run dev
```

Or via Docker, from the project root (also starts backend + Airflow together — see the top-level `README.md`):

```bash
docker compose up -d frontend
```

## Build

```bash
npm run build
npm run preview
```

## Environment

Set API endpoint in `frontend/.env`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

## Important Files

- `src/App.jsx` - routes and protected pages
- `src/context/AuthContext.jsx` - session handling
- `src/api/` - API wrappers
- `src/pages/` - page-level UI

## UX Notes

- Sign-in page is intentionally simplified for easier onboarding.
- Prediction page shows whether inference is from real ML model or fallback.
