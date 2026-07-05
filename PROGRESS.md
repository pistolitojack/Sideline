# Sideline — Build Progress

## Phase 3 — Real uploads + in-app voice memo + visual upgrade ✅ (built, awaiting your review)

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

## What's next — Phase 4
The worker service: ingest (ffprobe/proxy/audio) → Deepgram transcription →
Claude moment-finding → compose/write. Review shows real AI-written pieces as
text cards. Needs: Railway account for the worker, Anthropic API key.
