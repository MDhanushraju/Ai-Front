# AI Chat Backend

## Setup

1. Create `back/.env` from `back/.env.example`
2. Install deps:
   - `npm install`
3. Run:
   - `npm run dev` (Node watch mode)

## Endpoints

- `GET /health`
- `POST /api/nvidia/chat`
  - Body:
    - `prompt` (string) OR `messages` (array of `{ role, content }`)
    - optional: `model`, `params`

