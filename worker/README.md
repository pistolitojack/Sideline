# Sideline worker

The background service that turns queued sessions into finished pieces:
**ingest → transcribe (Deepgram) → understand (Claude vision) → compose/write
(Claude)**. Polls the `jobs` table every few seconds. Rendering is Phase 5.

## Environment variables

| Name | Where it comes from |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key (**secret** — server only) |
| `DEEPGRAM_API_KEY` | console.deepgram.com → API Keys |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `POLL_INTERVAL_MS` | optional, default `5000` |

## Deploy on Railway

1. railway.app → New Project → **Deploy from GitHub repo** → pick this repo.
2. Settings → **Root Directory** = `worker` (it detects the Dockerfile).
3. Variables → add the four env vars above.
4. Deploy. Logs should show `Sideline worker up — polling every 5000ms`.

## Run locally

```bash
cd worker
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
DEEPGRAM_API_KEY=... ANTHROPIC_API_KEY=... npm start
```

Requires `ffmpeg`/`ffprobe` on PATH (the Dockerfile installs them).
