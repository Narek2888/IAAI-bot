# IAAI-bot

## Local dev

- Run both backend + Vite frontend: `npm run dev`
- Backend only: `npm run dev:backend`
- Frontend only: `npm run dev:frontend`

Local dev requires `DATABASE_URL` (see `.env.example`).

Run DB migrations: `npm run migrate`

The Vite dev server proxies `/api` requests to the backend.

## Deploy to Railway (GitHub integration)

This repo is set up for a single Railway service that:

- Builds the Vite frontend to `frontend/dist`
- Serves the built frontend from the backend Express app
- Exposes the API under `/api/*`

Steps:

1. Push this project to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** and select your repo.
3. Railway will detect `nixpacks.toml` and build automatically.
4. No fixed port needed: Railway provides `PORT` automatically.

Notes:

- This project uses Postgres via `DATABASE_URL`. In Railway, add a Postgres plugin and Railway will provide the connection string.
