# Deploying the AI Chat app (GitHub Pages + backend)

When you use **GitHub Pages** for the frontend, the live site (e.g. `https://yourusername.github.io/Ai-bot/`) runs in the user’s browser. There is **no server** for the app on GitHub—only static files. The app needs a **backend** for login and chat (NVIDIA API). If you don’t set a backend URL, the app will try `http://localhost:8081`, which only works on your own computer, so the live link will show “Failed to fetch” on mobile or for other users.

To make the **GitHub live link** work (including on mobile), do two things:

1. **Deploy the backend** somewhere public.
2. **Tell the frontend** that URL when you build, then redeploy the frontend to GitHub Pages.

---

## 1. Deploy the backend

The backend lives in **`ai-chat-back/`** at the project root (outside the Front folder). Deploy it to any host that runs Node, for example:

- **[Render](https://render.com)** (free tier)
- **[Railway](https://railway.app)**
- **[Fly.io](https://fly.io)**

### Example: Render (free)

1. Push your repo to GitHub (including the `ai-chat-back/` folder).
2. On [Render](https://render.com), sign in with GitHub and **New → Web Service**.
3. Connect the repo and set:
   - **Root directory:** `ai-chat-back` (backend is at project root, outside Front).
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. In **Environment**, add:
   - `NVIDIA_API_KEY` or `VITE_NVIDIA_API_KEY` = your NVIDIA API key (same value as in `.env`).
5. Deploy. Render will give you a URL like `https://your-app-name.onrender.com`.

That URL is your **backend URL**. The frontend will call:

- `https://your-app-name.onrender.com/health`
- `https://your-app-name.onrender.com/login`
- `https://your-app-name.onrender.com/api/nvidia/chat`

---

## 2. Build the frontend with the backend URL and deploy to GitHub Pages

The frontend must be **built** with your backend URL so the live site doesn’t use `localhost`. Use the env variable **`VITE_API_BASE`**.

### Option A: Build and deploy from your machine

1. In the **frontend** folder (e.g. `Front/React/Ai-Chat`), set the backend URL and build:

   ```bash
   cd "d:\Ai conversational mobile app\Front\React\Ai-Chat"

   set VITE_API_BASE=https://your-app-name.onrender.com
   npm run build
   npm run deploy
   ```

   (On Mac/Linux use `export VITE_API_BASE=...` instead of `set`.)

2. Push the `gh-pages` branch (or whatever your `npm run deploy` uses) so GitHub Pages updates.

After this, the **GitHub live link** will call your Render (or other) backend, so it will work on GitHub and on mobile.

### Option B: Build with GitHub Actions (and a secret)

1. In your repo on GitHub go to **Settings → Secrets and variables → Actions** and add a secret:
   - Name: `VITE_API_BASE`
   - Value: `https://your-app-name.onrender.com` (your real backend URL).

2. Add a workflow that builds with that secret and deploys to GitHub Pages (e.g. build with `VITE_API_BASE` from secrets, then use `peaceiris/actions-gh-pages` or your existing `gh-pages` deploy step).

Once the frontend is built with `VITE_API_BASE` pointing at your deployed backend, the **GitHub** (live) site will work, including on mobile.

---

## Summary

| Step | What to do |
|------|------------|
| 1 | Deploy `ai-chat-back/` to Render (or Railway, Fly.io, etc.) and get the backend URL. |
| 2 | Build frontend with `VITE_API_BASE=<backend URL>`, then deploy to GitHub Pages (`npm run deploy` or Actions). |
| 3 | Open the GitHub Pages URL; the app will use the deployed backend and stop showing “Failed to fetch” on GitHub / mobile. |

If you don’t set `VITE_API_BASE`, the built app keeps using `http://localhost:8081`, which only works when you run the app and backend on your own computer, not on the GitHub live link.
