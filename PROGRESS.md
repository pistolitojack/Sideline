# Sideline — Build Progress

## Phase 2 — Onboarding + real Coach DNA ✅ (built, awaiting your review)

**What's done**
- **Full onboarding flow** matching the prototype: welcome → Instagram handle
  (with the 2s "studying your page" moment — real scraping is V2) → Coach DNA
  card (name, sport chips, brand color, tone chips) → **voice memo** (real
  in-browser recording up to 60s, transcribed with Deepgram, transcript stored)
  → mission → straight into the app.
- Everything is saved to a real **`coaches` table in Supabase**, protected by
  Row Level Security (each coach can only see their own data).
- **Your brand color restyles the whole app** — chosen in onboarding, stored in
  the DB, applied to every accent in Today/Review/Business.
- New signups are automatically routed: sign in → no profile yet → onboarding
  → Today screen with your name and color.
- Mission changes from the Today screen now save to the database.
- `supabase/schema.sql` — the entire database schema (all V1 tables + security
  rules) ready to paste into Supabase once.

**How to test (the "first user" experience)**
1. Create a free project at supabase.com.
2. In the Supabase dashboard: SQL Editor → paste all of `supabase/schema.sql` → Run.
3. Settings → API: copy the Project URL and anon key.
4. In Vercel (project → Settings → Environment Variables) set:
   - `NEXT_PUBLIC_SUPABASE_URL` = your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
   - `NEXT_PUBLIC_DEMO_MODE` = `false`
   - `DEEPGRAM_API_KEY` = (optional, from console.deepgram.com — needed for
     the voice memo transcription; without it that step offers a skip)
5. In Supabase: Authentication → URL Configuration → set Site URL to your
   Vercel URL (e.g. `https://sideline-xyz.vercel.app`).
6. Redeploy on Vercel, open the link on your phone, and sign up with your email.

## Phase 1 — Scaffold, auth, 3-tab shell, Demo Mode ✅
- Next.js + Tailwind, prototype design, Demo Mode with 5 seeded pieces,
  Today/Review/Business tabs, swipe review with skip reasons + detail sheet,
  magic-link auth, Terms/Privacy placeholders.

## What's next — Phase 3
Multi-video upload from the phone camera roll to Supabase storage with
progress bars, session + job rows created, and the calm processing screen.
