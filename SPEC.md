# Sideline V1 — Build Specification

## What this product is
Sideline is a mobile-first **web app** for sports coaches. A coach uploads raw training
footage from their phone. The AI finds the best moments, cuts them into vertical
(9:16) clips with burned-in captions in the coach's brand color, and writes the caption,
hook, hashtags, and call-to-action for each. The coach swipes through the results,
approves what they like, downloads the videos to their camera roll, and posts them
manually. **V1 has NO social-media integrations, NO music, NO native app.** The clips
keep the coach's original audio.

North-star UX rule: every screen removes a decision. The coach's only choices are
upload, approve/skip, download.

## Tech stack (do not substitute without asking)
- **Next.js (App Router) + Tailwind**, deployed on Vercel. Mobile-first responsive.
- **Supabase**: auth (email magic link), Postgres database, file storage.
- **Background worker**: a separate small Node.js service (deployable on Railway) that
  polls a `jobs` table in Postgres every few seconds and runs the pipeline. No Redis,
  no queues — a DB-polled job table is enough for V1.
- **ffmpeg** for all video work (installed on the worker).
- **Deepgram API** for transcription (word-level timestamps). Wrap it in a
  `transcribe(fileUrl)` function so the provider can be swapped later.
- **Anthropic API (Claude)** for moment-finding and writing. Model: claude-sonnet-4-6.
- **Stripe Payment Links** for billing in V1 (no checkout integration yet): a simple
  `is_active` flag on the coach record, set manually by the admin for pilot users.

## Design reference
Match `sideline-prototype-v3.jsx`: warm off-white background (#F6F5F2), ink text
(#1A1915), the coach's chosen accent color used everywhere (default #C8102E), system
font stack, generous whitespace, three tabs (Today / Review / Business), swipe-card
review. The coach's accent color must be dynamic (chosen in onboarding, stored, applied
across the app and burned into rendered captions).

## Database tables (Supabase Postgres)
```sql
coaches(id uuid pk, auth_user_id, name, sport, tones text[], accent_hex,
        audience, mission, ig_handle, voice_memo_transcript, is_active bool default false,
        created_at)
sessions(id uuid pk, coach_id fk, status text check in
        ('uploading','queued','processing','ready','failed'), created_at)
media_assets(id uuid pk, session_id fk, storage_path, kind text check in
        ('raw','render'), duration_sec, width, height)
moments(id uuid pk, session_id fk, asset_id fk, t_start float, t_end float,
        type text, score float, reason text, transcript_span text)
content_pieces(id uuid pk, session_id fk, format text check in ('reel','story'),
        edl jsonb, render_asset_id fk nullable, hook text, caption text,
        hashtags text, cta text, why text, suggested_slot text, suggested_sound text,
        status text check in ('rendering','ready','approved','skipped','downloaded'),
        skip_reason text nullable, created_at)
jobs(id uuid pk, session_id fk, stage text, status text check in
        ('pending','running','done','failed'), attempts int default 0,
        error text, created_at, updated_at)
```
Enable Supabase Row Level Security: coaches can only read/write their own rows.

## The AI pipeline (runs on the worker, stage by stage per session)
Each stage is a separate function; each writes its results to the DB and advances the job.

**Stage 1 — Ingest.** For each raw video: probe with ffprobe (duration, resolution,
audio presence), transcode a low-res proxy, extract audio as WAV.

**Stage 2 — Transcribe.** Deepgram on the audio → word-level timestamps. Store raw JSON.

**Stage 3 — Understand (Claude with vision).** Sample frames at 1 frame every 2 seconds
(max ~30 frames per video, resized to 512px). Send frames + transcript + the coach's
profile (sport, audience, mission) to Claude. Ask for a JSON array of moments:
```json
[{"t_start": 7.5, "t_end": 20.8, "type": "teaching|hype|transformation|story|funny|technique",
  "score": 0.0-1.0, "reason": "one sentence", "hook_idea": "short hook"}]
```
Instruct Claude to return ONLY JSON. Validate and store in `moments`.

**Stage 4 — Compose + Write (Claude).** Take the top 3–6 moments (diverse types, score
≥ 0.5). For each, ask Claude for a complete piece as JSON:
```json
{"format": "reel|story",
 "edl": {"asset_id": "...", "in": 7.5, "out": 20.8,
   "crop": {"mode": "center|eased", "start_x_frac": 0.35},
   "captions": [{"text": "FAST FEET AREN'T BORN.", "t0": 0, "t1": 2.4, "style": "hook"},
                {"text": "They're built.", "t0": 2.4, "t1": 5.0, "style": "body"}]},
 "hook": "...", "caption": "... (in the coach's voice, using their voice memo transcript
   and tones)", "hashtags": "#... 4-6 tags", "cta": "aimed at the coach's mission",
 "why": "one sentence explaining the choice to the coach",
 "suggested_slot": "Tue 6:00 PM", "suggested_sound": "name a fitting style of trending
   sound, e.g. 'hard-hitting phonk beat' — never a specific copyrighted song"}
```
Landscape sources get cropped to 9:16; vertical sources pass through. Caption beats must
land inside the cut. Max reel length 60s, story 15s.

**Stage 5 — Render (ffmpeg).** Execute each EDL deterministically. Reference recipe
(proven working — adapt, don't reinvent):
- Crop landscape to 9:16: `crop=608:1080:x:0` then `scale=1080:1920`. For
  `mode:eased`, animate x for the first ~3s:
  `x='if(lt(t,3), STARTX+(656-STARTX)*t/3, 656)'` where STARTX = start_x_frac*1920-304.
- Hook captions: drawtext with a solid accent-color box:
  `fontfile=<bold font>:fontcolor=white:box=1:boxcolor=<ACCENT>@1:boxborderw=22:
  fontsize=58:x=(w-text_w)/2:y=1440:enable='between(t,T0,T1)'` (write caption text to
  temp files to avoid escaping bugs).
- Body captions: white, `borderw=6:bordercolor=black@0.55`, fontsize 44–60.
- Audio: keep original; normalize with `loudnorm=I=-16:TP=-1.5:LRA=11`.
- Fades in/out 0.35s. Output: H.264, CRF 20, yuv420p, 30fps, +faststart.
- Upload renders to Supabase storage; set piece status to `ready`.

**Failure handling:** any stage that throws marks the job `failed` with the error, retries
once, and the session shows a friendly "That upload didn't work — try again" state. Never
a dead spinner.

## Screens (match the prototype)
1. **Auth**: email magic link. New users → onboarding.
2. **Onboarding** (5 steps, exactly as in the prototype): welcome → Instagram handle
   (V1: just store the handle; show the "studying your page" moment as a 2s pause —
   real scraping is V2) → Coach DNA card (name, sport chips, accent color, tone chips) →
   voice memo (record 60s in-browser with MediaRecorder, transcribe with Deepgram, store
   transcript) → mission → done, straight into first upload.
3. **Today**: big accent upload card, Mission chip (tap to change via sheet), "N pieces
   ready" pill, This Week strip of approved pieces, day dots.
4. **Upload**: file picker (multiple videos, accept video/*), per-file progress bars,
   uploads go directly to Supabase storage (resumable), then create session + queue jobs.
   Show the calm processing screen with stage names; poll status; notify in-app when ready.
5. **Review**: swipe stack of ready pieces (video autoplays muted, loops). Right =
   approve, left = skip (with the 3-option reason sheet: Bad moment / Wrong vibe / Don't
   post this athlete). Tap = detail sheet: hook, full caption, hashtags, CTA, "Why I made
   this", suggested slot + sound. Buttons ✕ / ✓ as swipe alternatives.
6. **Approved piece actions**: **Download video** (direct file download) and **Copy
   caption** (caption + hashtags + CTA to clipboard). Mark status `downloaded` after.
7. **Done screen**: "Your week is handled", day dots, Autopilot progress bar (visual
   only in V1: `(9 + approvals)/20`).
8. **Business tab**: V1 = a simple placeholder card: "Your Sunday Report arrives after
   your first week of posting" + the mission line. No fake numbers in production.
9. **Admin page** (`/admin`, only for the founder's email): list coaches, toggle
   `is_active`, see sessions/jobs and errors, link to Stripe payment link.

## Non-negotiables
- Works great on a phone browser (test at 390px width). PWA manifest + icon so coaches
  can "Add to Home Screen".
- A **Demo Mode** (env flag): seeds a fake coach + 5 sample pieces so the whole UI can be
  reviewed without running the pipeline. Build this in Phase 1.
- Original audio preserved in every render. No music anywhere in V1.
- Plain-English errors. No stack traces shown to coaches.
- Terms of Service + Privacy Policy placeholder pages linked in onboarding, including a
  line: "You are responsible for having permission (including parent/guardian consent for
  minors) to post the athletes in your footage."

## Build phases (the contract for pacing)
- **Phase 1**: Scaffold, Tailwind, Supabase auth, 3-tab shell, Demo Mode with seeded
  pieces so Today/Review/Business are all clickable with fake data.
- **Phase 2**: Onboarding flow storing a real Coach DNA row (incl. in-browser voice memo
  recording + transcription). Accent color applied app-wide from the DB.
- **Phase 3**: Upload to Supabase storage + session/job creation + processing status UI.
- **Phase 4**: Worker service: ingest → transcribe → moments → compose/write. Results
  visible in Review as text-only cards (poster frame + captions, no rendered video yet).
- **Phase 5**: ffmpeg rendering per the EDL recipe, video playback in Review, download +
  copy-caption actions.
- **Phase 6**: Mission sheet, Autopilot bar, admin page, PWA polish, deploy web app to
  Vercel + worker to Railway, Stripe payment link on the marketing/paywall page.

Definition of done for V1: a brand-new coach can sign up on their phone, onboard, upload
three real clips, get back 3–6 finished pieces within ~15 minutes, approve them, download
the videos, and copy the captions — with zero help from a human.
