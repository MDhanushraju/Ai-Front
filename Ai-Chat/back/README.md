# AI Chat Backend

Runs on http://localhost:8081. Used by the frontend for login and chat.

## Setup

1. Copy `.env.example` to `.env` or ensure `../.env` has `VITE_NVIDIA_API_KEY`.
2. `npm install`
3. `npm run dev`

## Endpoints

- `GET /health`
- `POST /login` – body: `{ username, password }`, returns `{ success, username }`
- `GET /health/nvidia`
- `POST /api/nvidia/chat`
