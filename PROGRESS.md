# Sideline — Build Progress

## Phase 4 — The AI pipeline (worker) ✅ built, needs deploy to run

**What's done**
- **`worker/` — the background service** (deployable on Railway): polls the
  `jobs` table and runs the pipeline per SPEC:
  1. **Ingest** — ffprobe every raw video (duration/resolution/audio), extract
     clean 16kHz audio.
  2. **Transcribe** — Deepgram with word-level timestamps (silent footage is
     fine — it continues without speech).
  3. **Understand** — Claude (claude-sonnet-4-6) sees sampled frames (1 per
     ~2s, max 30, 512px) + the transcript + the coach profile and returns
     scored, typed moments → `moments` table.
  4. **Compose/Write** — top 3–6 diverse moments (score ≥ 0.5); Claude writes
     each piece in the coach's voice (voice memo transcript conditions it):
     EDL with caption beats, hook, caption, hashtags, CTA, "why", suggested
     slot + sound style → `content_pieces` (status `ready`) with a poster
     frame extracted from the cut.
- Failure handling per SPEC: a failing stage retries once, then the job is
  `failed` with the error stored and the session shows the friendly failed
  state. No dead spinners.
- **Review now shows real pieces** for signed-in coaches (poster frame +
  cycling caption words + all the text), and approve/skip decisions persist
  to the database with skip reasons.

**To make it run (one-time deploy)**
1. console.anthropic.com → sign in → add ~$5 credit → create an API key.
2. railway.app → New Project → Deploy from GitHub repo → root directory
   `worker` → add env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   (Supabase → Project Settings → API → service_role), `DEEPGRAM_API_KEY`,
   `ANTHROPIC_API_KEY`.
3. Watch the logs: "Sideline worker up". Any queued session gets picked up
   automatically, including ones uploaded before the worker existed.

**Reality check on quality:** Phase 4 output is text + a poster frame per
piece — the writing and moment choice are the product here. The actual
rendered vertical videos with burned-in captions (the "edited video" part)
are Phase 5.

## Phase 3 — Real uploads + in-app voice memo + visual upgrade ✅ verified on a real phone

**What's done**
- **Upload flow** (`/upload`): tap the big card on Today → pick multiple videos
  from your camera roll → per-file progress bars → files land in private
  Supabase storage (resumable uploads, so bad wifi resumes instead of
  restarting) → a session + job row are created and the session sits in
  `queued` → calm "Your employee has it" screen.
- **Today shows the live session status** ("In line — cutting starts soon"),
  refreshing automatically every few seconds.
- **Voice memo moved into the app**: coaches who skipped it in onboarding get
  a "Teach it your voice" card on Today — records 60s, transcribes via
  Deepgram, saves to the profile, card disappears once done.
- **Visual upgrade across the app**: ambient accent-tinted background, light
  sweep across the hero upload card, floating glass tab bar, deeper shadows,
  press feedback on every button, blurred sheets.
- `supabase/storage.sql` — creates the private `raw` bucket + access rules
  (each coach can only touch their own folder). **Must be run once in the
  Supabase SQL Editor before uploads work.**

**How to test**
1. Supabase → SQL Editor → paste all of `supabase/storage.sql` → Run →
   expect "Storage ready".
2. (For the voice memo) Vercel → Environment Variables → add
   `DEEPGRAM_API_KEY` from console.deepgram.com → redeploy.
3. On your phone: open the app → tap the upload card → pick 1–3 short videos
   (keep each under ~50MB on the free Supabase tier) → watch the bars →
   "Your employee has it."
4. Back on Today you'll see the queued status pill. In Supabase → Table
   Editor → `sessions` should show a `queued` row; Storage → `raw` shows
   your files.
5. Tap the dark "Teach it your voice" card, record, and check
   `coaches.voice_memo_transcript` fills in.

## Phase 2 — Onboarding + real Coach DNA ✅
Full onboarding (IG handle → Coach DNA → voice memo → mission), coaches table
with RLS, accent color applied app-wide, code-based email sign-in.

## Phase 1 — Scaffold, auth, 3-tab shell, Demo Mode ✅
Next.js + Tailwind, prototype design, Demo Mode, swipe review, magic-link auth.

## What's next — Phase 5
ffmpeg rendering per the EDL recipe (eased crop to 9:16, accent-color hook
plates, body captions, loudnorm, fades), video playback in Review, and
Download video + Copy caption on approved pieces.
