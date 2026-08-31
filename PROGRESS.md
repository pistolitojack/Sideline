# Sideline — Build Progress

## Phase 3 — The AI Brain (in progress)

- **Baseline saved** — `BASELINE-BEFORE-PHASE-3.md` captures session
  `ec978e5a` (3 videos, empty prompt): the director's full plan, all three
  finished pieces, six objective observations, and Jack's feel note. Every
  Phase 3 item is compared back to this.
- **Bug fix (found during baseline):** burned-in captions rendered a "tofu"
  square (□) wherever copy contained an emoji, because the DejaVu font has no
  emoji glyphs. `sanitizeForBurn()` now strips emoji/pictographs/symbols before
  drawtext; em dashes, ellipses, curly quotes and accented Latin survive.
- **3.7 Motion-adaptive frame sampling** ✅ built (taken out of order — it is
  the item that addresses Jack's "cuts at the wrong time" complaint, and it has
  no dependency on 3.3-3.5). `sampleFrames` now runs a cheap analysis pass
  (downscale → frame differencing → average luma of the difference) to find
  where the clip actually MOVES, then samples ~0.5s apart inside a ±2s window
  around each motion peak and ~3.5s apart elsewhere. Exact per-timestamp seeks
  keep the frame→time mapping precise, which matters because the AI cuts using
  those timestamps. Falls back to the old uniform sampler if the motion read
  fails, so the stage can't break. Verified on synthetic footage: a clip with a
  burst at 7.8-9.2s put 10 of 15 frames inside the action window.
  *Deviation:* instead of dumping frames to a per-session debug folder (storage
  cost), the worker logs the detected peak timestamps — same diagnostic value,
  no storage.
- **Pacing rules removed** — shot length and shot count are no longer
  prescribed per kind. The editor decides from the action itself; only a safety
  rail remains (30s/shot, 60s total) so a malformed reply can't break a render.
  This replaced the kind-based caps added earlier the same day, per Jack: the
  AI should be smart enough to judge, and hard numbers fight that.
- **Bug fix:** every non-"single" piece had inherited the montage's hard 6s
  per-shot cap, so a teaching or story piece could never show a full rep. That
  was the root cause of "it didn't let any drill play out."
- **Thinking had to be bounded (spec deviation).** Phase 3 said not to force a
  word count on the `<thinking>` block. Unbounded, it burned the entire output
  budget three separate times — pieces were dropped, one compose call took two
  minutes, and cost climbed. Compose now has a hard limit of ~120 words of
  terse notes. Reasoning quality held; the runaway stopped. Truncation salvage
  was also rewritten to walk back comma-by-comma, so a cut-off reply keeps its
  valid parts (verified against mid-key, mid-number, and deep-nested cuts)
  instead of losing the piece.
- **3.2 Thinking space** ✅ built — the director, understand, compose and revise
  prompts now ask the model to reason inside a `<thinking>` block before it
  emits JSON (no word limit — it takes the space it needs), and each system
  prompt was updated to permit that. `extractJson` strips closed and truncated
  thinking blocks before hunting for the payload, which matters because
  reasoning prose routinely contains braces that would otherwise derail the
  parser. Compose's token budget went 3000 → 4000 so a long reasoning pass can
  never truncate the JSON. Verified against 6 parser cases including
  braces-inside-thinking and old-style replies with no thinking at all.
- **3.1 Prompt caching** ✅ built — `askClaude` now sends the system prompt as a
  cached block, accepts a `cacheable()` marker for the last block of a stable
  prefix, and logs per-call token usage (`in / cache_write / cache_read / out`,
  flagged "cache HIT"). Cache points: the director's frames+coach profile, the
  compose stage's coach preamble (identical across the 3-5 piece calls in a
  session — the biggest win), and the revise stage's sampled frames. Every
  Claude call is now labeled in the worker logs.


## Phase 2 — The AI director ✅ complete

- **2.5 Natural-language revision loop** ✅ — the revise stage now works like
  a real editor: it samples frames of the piece's source clips (director-style
  vision), reads the current piece (edl, kind, intent, copy) and the coach's
  free-text note, and asks Claude to re-cut + rewrite honoring ANY plain
  request ("cut faster", "start on the payoff", "less hype more teaching"),
  then re-renders just that piece and regenerates its poster (the opening may
  have moved). Every request is appended to `content_pieces.revision_history`
  (migration `supabase/v8-revision-history.sql`), and the Review + Today
  detail sheets show a "Changes you've asked for" list. The "Ask for changes"
  box now reads "Tell your employee what to change."


- **2.4 Renderer handles the plan's recipes** ✅ — the render stage was
  already fully segment-based (it builds from `edl.segments` for any piece,
  or a single `{asset_id,in,out}` cut), downloads each distinct source once,
  normalizes every segment to 1080x1920, then takes a single-clip fast path
  or an xfade/acrossfade chain with per-segment transitions. No montage-only
  branch — 2.3's composer emits that same shape for every planned piece, so
  single-clip and multi-clip (across multiple source assets) both render.
  Hardening added: the crossfade duration is clamped to half of each adjacent
  segment, so any recipe or revision with short beats joins cleanly instead of
  erroring. The recipe stays intent-only — the composer translates it into
  concrete segments; the renderer never parses it.


- **2.3 Compose follows the plan** ✅ built — `compose()` no longer decides
  what to make. It reads `sessions.plan.planned_pieces` and produces one
  content piece per planned piece: it gathers the moments from that piece's
  cluster(s), asks Claude to realize the `structural_recipe` as a concrete
  segment EDL (single cut or multi-clip with transitions) and to write the
  hook/caption/hashtags/CTA shaped by the piece's kind and intent. The
  planned kind and the director's `why_this_piece` are stored on
  `content_pieces.piece_kind` / `director_intent` (migration
  `supabase/v7-piece-intent.sql`); the Review card's "why I made this" line
  now shows `director_intent`, and the type badge uses `piece_kind`. The old
  self-deciding logic and the standalone montage function were removed —
  montage is now just one kind the director can plan. Moment-finding
  (understand) is prompt-aware too.


- **2.2 The director stage** ✅ built — new `direct` pipeline stage runs
  after ingest, before transcribe. It samples 3-4 frames per uploaded video
  and sends them + the coach profile (sport, audience, mission, city,
  ig_profile) + the optional prompt to Claude (vision), which returns a JSON
  content plan: a read of the footage, clusters of same-drill videos (with an
  angle_variety_score), director notes, and 3-5 planned pieces (kind,
  cluster to use, target length, structural recipe, why_this_piece). Stored
  on `sessions.plan`; each video is tagged with its cluster on
  `media_assets.cluster_id/cluster_label`. Guardrails: honor the prompt as
  top priority, aim for variety when there's no prompt, never plan more
  pieces than the footage supports, never plan a multi-angle/teaching piece
  without a cluster that actually has multiple angles. Migration
  `supabase/v7-plan.sql`. (Compose still ignores the plan until 2.3 — the
  plan is created and stored now, wired into content in the next item.)

- **2.1 Optional prompt at upload** ✅ built — removed the montage toggle;
  the upload screen now has one optional 3-row prompt box ("tell your
  employee what you want… or leave blank and let me decide"), saved as
  `sessions.prompt`. Migration `supabase/v7-session-prompt.sql` adds
  `prompt`, copies any legacy `brief` into it, and drops the unused
  `montage` column. (The director stage in 2.2 is what reads `prompt`;
  until then the worker still reads the legacy `brief`.)


## Phase 1 — Foundation & safety (in progress)

- **1.5 IG profile refresh** ✅ built — `coaches.scanned_at`
  (`supabase/v6-ig-refresh.sql`) records when the Instagram scan last ran.
  `ensureIgProfile` now re-scans when scanned_at is null or older than 30
  days (instead of only once ever), and stamps scanned_at only on a
  successful scan — a failed scan leaves it untouched so the next session
  retries rather than waiting 30 days.

- **1.4 Security headers** ✅ built — `next.config.ts` now sends
  Content-Security-Policy, X-Frame-Options: DENY, Referrer-Policy:
  strict-origin-when-cross-origin, X-Content-Type-Options: nosniff, and
  Permissions-Policy (camera/microphone limited to same-origin) on every
  route. CSP allows self, the inline styles/scripts Next needs, and Supabase
  (auth + storage signed URLs + realtime via *.supabase.co). Verified all
  five headers on the served response. Nonce-based tightening logged in IDEAS.

- **1.3 Poster-frame race** ✅ built — `content_pieces.render_asset_id`
  now stays `null` until the render stage produces the real mp4 (it used to
  temporarily point at the poster JPG). Pieces are reviewable right away
  showing the poster + a subtle accent-tinted "Finishing edit…" overlay
  (Footage component, used by Review and Today); no `<video>` is ever loaded
  while the render is pending. Establishes the clean invariant the editing
  engine depends on: render_asset_id is a valid mp4 or null, never a JPG.

- **1.2 Coach location** ✅ built — new "Where do you coach?" step in
  onboarding (between mission and finish; "City, State"), saved to
  `coaches.city` (`supabase/v6-coach-city.sql`). Coaches who onboarded
  before this see a dismissible "Add your city" card on Today that opens a
  sheet with the same input; once city is set the card never returns,
  dismissal persists via localStorage. Soft-required — never blocks the app.

- **1.1 Upload limits** ✅ built — enforces 200MB/video (rejected at pick
  time), 6 videos/session, and 3 sessions per coach per rolling 24h. The
  24h cap is enforced both in the UI (quota line + friendly block message +
  disabled button) and in the database via a trigger
  (`supabase/v5-upload-limits.sql`) so it survives refresh / private window.
  Verified: pick 7 files → "first 6" note; pick a 300MB file → left out;
  4th session in 24h → daily-limit copy; private window still blocked.

## V2 Creative Engine (part 2) ✅ built & transition chain test-rendered

- **The revision loop**: every real piece (Review detail sheet + Today's
  approved sheet) has "Ask for changes" — the coach's note flips the piece
  to `rendering`, queues a `revise` job, and the worker's editor applies the
  note (re-cut bounds, captions, copy, transitions), then re-renders just
  that piece. Requires `supabase/v3-revisions.sql` (adds
  content_pieces.revision_note).
- **Montage transitions**: the composer picks a transition per cut (hard cut
  on beats, crossfade for mood, occasional slide/circle wipes) and the
  renderer joins segments with ffmpeg xfade/acrossfade. Verified locally.
- **Cleanup stage**: a `cleanup` job deletes orphaned render files (old
  re-renders, deleted reels) and pipeline artifacts (wav/transcripts) of
  finished sessions. Queue with:
  `insert into jobs (session_id, stage, status)
   select id, 'cleanup', 'pending' from sessions order by created_at desc limit 1;`
- Render stage is selective again: only `rendering` pieces (fresh or
  revised) re-render; force a full re-render by setting statuses first.

## V2 Creative Engine (part 1) ✅ built & montage pipeline test-rendered

- **Mix-tape montage reels**: toggle on the upload screen — the AI cuts ONE
  fast reel from segments across ALL uploaded videos (6-12 segments of
  1.5-4s, opens on the biggest payoff, 20-40s total). Renderer now supports
  multi-segment EDLs: per-segment normalize → concat → captions/fades/
  loudnorm. Verified locally with mixed-orientation + silent sources.
- **"Tell your employee" brief**: optional note at upload ("focus on the girl
  in blue", "championship day") honored by moment-finding, writing, and the
  montage cut. Stored on the session.
- Montage pieces get a green Montage badge; duration sums segments.
- Requires one-time SQL: `supabase/v2-creative.sql` (adds sessions.brief +
  sessions.montage).

## Phase 5 — Rendering + playback + download ✅ built & recipe test-rendered

- Worker gained a **render** stage (after compose): executes each EDL with
  ffmpeg per the SPEC recipe — eased/center crop of landscape to 9:16 (or
  cover-fit for vertical), accent-color hook plates, bordered body captions
  (text via temp files), 0.35s fades, loudnorm, H.264 CRF 20 yuv420p 30fps
  +faststart. Uploads the mp4, repoints the piece's render asset, marks it
  ready. Idempotent — re-render jobs skip pieces that already have video.
- Verified locally: synthetic 1920x1080 clip → 1080x1920 h264 with both
  caption styles burned in, correct duration + audio.
- App: Review cards **play the rendered video** (autoplay, muted, loop);
  approved pieces on Today open a sheet with **Download video** (marks
  status downloaded) and **Copy caption** (caption + CTA + hashtags).
- Backfill: run `insert into jobs (session_id, stage, status) select id,
  'render', 'pending' from sessions where status = 'ready';` once in the
  Supabase SQL editor to render pieces made before this phase.

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
