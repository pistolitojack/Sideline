# Sideline — Build Progress

## Phase 1 — Scaffold, auth, 3-tab shell, Demo Mode ✅ (built, awaiting your review)

**What's done**
- Next.js (App Router) + Tailwind project scaffolded; mobile-first, matches the
  prototype's design (warm paper background, ink text, Signal Red accent).
- **Demo Mode**: with `NEXT_PUBLIC_DEMO_MODE=true` the whole app works with a
  fake coach ("Coach Dre") and 5 sample pieces — no login, no keys needed.
- **Today tab**: big accent upload card (uploads themselves come in Phase 3),
  Mission chip with the change-mission sheet, "N pieces ready" pill, This Week
  strip, day dots.
- **Review tab**: swipe stack — drag right to approve, left to skip (with the
  3-reason sheet), tap a card for the detail sheet (hook, caption, hashtags,
  CTA, "Why I made this", suggested slot). ✕ / ✓ buttons as swipe alternatives.
  Clearing the stack shows the "Your week is handled" done screen with the
  Autopilot bar.
- **Business tab**: V1 placeholder card + mission line (per SPEC — no fake numbers).
- **Auth**: email magic-link sign-in via Supabase (login page, callback route,
  middleware protecting the app). If Supabase keys aren't set, the login page
  explains what to do instead of crashing.
- Terms of Service + Privacy Policy placeholder pages (with the athlete-consent line).

**How to test**
1. `npm install`
2. Copy `.env.local.example` to `.env.local` (Demo Mode is already on in it).
3. `npm run dev` and open http://localhost:3000 on your computer — or on your
   phone via your computer's local IP (e.g. http://192.168.x.x:3000).
4. Click through Today / Review / Business. Swipe the cards. Tap a card for
   details. Clear the stack to see the done screen.
5. To test real login: create a free Supabase project, paste its URL and anon
   key into `.env.local`, set `NEXT_PUBLIC_DEMO_MODE=false`, restart, and sign
   in with your email.

## What's next — Phase 2
Onboarding flow (welcome → Instagram handle → Coach DNA card → in-browser
voice memo with Deepgram transcription → mission), storing a real coach row in
Supabase, and the coach's accent color applied app-wide from the DB.
