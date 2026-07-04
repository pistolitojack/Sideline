# SIDELINE — The AI Marketing Employee for Sports Coaches
### Company & Product Blueprint v1.0

*(Working name: "Sideline" — the person standing next to the coach, handling everything that isn't coaching. Rename freely.)*

---

## 0. The One Sentence

**A coach films practice like they always do. By dinner, a week of content is waiting for approval.**

Every decision below is filtered through one question: *does this save the coach time?* If a feature makes the coach think, choose, tweak, or learn — it's a candidate for deletion. The product's enemy is not competitors. It's the coach's exhaustion at 8 PM.

---

## 1. Product Strategy

### The core insight
Coaches don't have a content *creation* problem. They have a content *decision* problem. The footage exists. What kills them is: What's worth posting? Where do I cut? What do I write? When do I post? What's my hook? Fifty micro-decisions per video, times five videos a week.

So the product is not an editor. **It is a decision-eliminator.** Every screen exists to reduce a decision from "open-ended" to "yes / no / not this one."

### The three product laws
1. **One input.** Raw footage. Nothing else is ever required from the coach.
2. **One interaction model.** Approve or skip. Never edit. (Editing exists, buried, for the 5% who want it.)
3. **Zero blank pages.** The coach never sees an empty text field, an empty timeline, or a "what would you like to create?" prompt. The AI always proposes; the coach only disposes.

### Positioning
We do not compete with CapCut, Opus Clip, or Descript. Those are tools for creators. We compete with **hiring a $2,500/month social media manager** — and we win because we were at practice and the manager wasn't. Pricing, marketing, and UX all anchor against the human employee, not against software.

### The moat (in order of durability)
1. **The Brand Brain** — the accumulating profile of each coach's voice, sport, athletes, offers, and what their audience actually engaged with. Month 6 output is dramatically better than day 1 output. Switching cost compounds weekly.
2. **Sport-specific intelligence** — a boxing pad session, a sprint block, and a youth soccer drill have completely different "money moments." Generic clipping tools can't tell a PR deadlift from a warm-up set. We can, because we only do sports.
3. **The approval graph** — every approve/skip is a labeled training example. No competitor can buy this data.

### Wedge → expansion
- **Wedge:** Individual strength/performance coaches and personal trainers (highest content-market fit, fastest sales cycle, they already film everything).
- **Expand:** Small gyms (multi-coach seats) → academies (multi-team, parent-facing content) → the endgame: Sideline books the leads it generates (see §16).

---

## 2. The Core Experience (The Golden Loop)

```
FILM (they already do this)
  → UPLOAD (one tap, runs in background)
    → AI WORKS (30–60 min, coach lives their life)
      → NOTIFICATION: "Your content from today's session is ready 🎬"
        → APPROVE (swipe through 6–10 pieces, ~3 minutes)
          → AUTO-SCHEDULED (posts go out at optimal times all week)
            → SUNDAY REPORT: "Your content reached 4,200 people. 3 DM'd about training."
```

The Sunday Report is not analytics. It is the **retention engine** — the weekly proof that the employee is earning its salary. It always ends with business outcomes (profile visits, DMs, link taps), never vanity metrics alone.

---

## 3. Onboarding — "The Interview"

Framing matters: this is not a settings form. It's **the first day of your new employee's job**, and they're interviewing *you*. Ten minutes, once, ever. Conversational, one question per screen, big type, thumb-friendly.

**Act 1 — Who are you? (90 seconds, mostly taps)**
Sport → specialty → who you train (youth / amateur / pro / gen-pop) → years coaching. Big tappable cards with icons, no typing.

**Act 2 — Steal your existing brand (2 minutes, mostly automatic)**
"Drop your Instagram handle." Sideline scrapes the public profile: pulls brand colors from the grid, detects logo, reads bios and captions to draft a voice profile, identifies best-performing past posts. Then shows its homework: *"Here's what I learned about your brand — did I get it right?"* with editable cards. **This is the magic moment of onboarding** — the employee proves competence before being asked to do anything. Website/TikTok/YouTube are optional accelerators.

**Act 3 — Hear your voice (2 minutes)**
"Record a 60-second voice memo: What do you believe about coaching that most coaches get wrong?" This single memo gives us tone, vocabulary, philosophy, cadence, and accent — worth more than twenty form fields. Transcribed, embedded, stored as the seed of the voice model.

**Act 4 — The business (90 seconds)**
What do you sell? (1-on-1 / group / online programs / camps) → price range → the goal: *more clients, more athletes, more online sales, or build the brand?* → dream client in one sentence.

**Act 5 — Connect & first upload**
Connect Instagram + TikTok (OAuth). Then immediately: *"Got any footage on your phone from this week? Even 30 seconds. Let's see what your new employee can do."* → first upload → the pipeline runs → **the "aha" arrives within the first session.** Activation metric #1: first content pack generated within 24 hours of signup.

Everything captured becomes the **Brand Brain** (§7), versioned and continuously updated.

---

## 4. The Dashboard — "The Desk"

There is no dashboard in the traditional sense. There are exactly **three screens**, and the coach lives in the first one.

### Screen 1 — Today (home)
- A single dominant element, 60% of the screen: **⬆ UPLOAD TODAY'S TRAINING** — a huge, warm, tappable card. Camera-roll picker opens instantly. Multi-select. Upload continues in background; coach can close the app.
- Below it, only if relevant: **"6 pieces ready for review"** (the approval queue badge) and a slim strip showing the next 3 scheduled posts.
- That's the whole screen. No charts. No feed. No feature grid.

### Screen 2 — Review (the approval queue)
A full-screen, vertical, swipeable stack — deliberately shaped like the platforms the content is for:
- Each card = one finished piece: rendered video playing muted with captions, plus the generated caption, hashtags, platform badge, and suggested post time.
- **Swipe right = approve** (it drops into the schedule). **Swipe left = skip.** Tap = expand for details or the buried "adjust" option (trim handles, caption edit, swap hook — that's the *entire* editor).
- A skip asks one optional one-tap question: *"Why? — Bad moment / Wrong vibe / Don't post this athlete."* Each answer trains the Brand Brain. "Don't post this athlete" adds a face to the athlete privacy list permanently.
- End of stack: **"Done. Your week is scheduled."** with a confetti-free, calm summary.

### Screen 3 — Business (the Sunday Report, on demand)
Reach, profile visits, link taps, DMs attributable to posts, best post of the week and *why it worked* in one sentence, and one suggestion: *"Transformation posts drive your DMs — film a before/after with Marcus this week?"* This is the only place numbers exist.

Settings, brand profile, billing: behind the avatar. Total surface area of the app: three screens and a sheet.

---

## 5. Technical Architecture

### Guiding principle
The product is asynchronous by nature (uploads take minutes, processing takes tens of minutes), so the architecture is an **event-driven pipeline**, not a request/response app. The app itself is thin; the factory behind it is deep.

### High-level system
```
┌─ CLIENTS ─────────────────────────────────────────────┐
│  Mobile app (React Native/Expo) — primary             │
│  Web app (Next.js) — review on desktop, admin, gyms   │
└──────────────┬────────────────────────────────────────┘
               │ GraphQL/tRPC + signed upload URLs
┌──────────────▼────────────────────────────────────────┐
│  API LAYER (Node/TS on serverless containers)         │
│  Auth (Clerk) · Billing (Stripe) · Uploads · Queue    │
└──────┬───────────────────────────────┬────────────────┘
       │ events (SQS/PubSub)           │
┌──────▼──────────────┐   ┌────────────▼───────────────┐
│  MEDIA PIPELINE     │   │  INTELLIGENCE LAYER        │
│  GPU/CPU workers:   │   │  ASR (Whisper-class)       │
│  ingest, transcode, │   │  Multimodal LLM (moment    │
│  scene detect,      │   │  scoring, story finding)   │
│  render (ffmpeg +   │   │  Text LLM (captions/hooks) │
│  templating engine) │   │  Embeddings (Brand Brain)  │
└──────┬──────────────┘   └────────────┬───────────────┘
       │                               │
┌──────▼───────────────────────────────▼────────────────┐
│  DATA: Postgres (core) · S3/R2 (media) · pgvector     │
│  (brand memory) · Redis (queues/state)                │
└──────────────────────┬─────────────────────────────────┘
┌──────────────────────▼─────────────────────────────────┐
│  PUBLISHING: Meta Graph API · TikTok Content API ·     │
│  YouTube Data API · scheduler (cron + queue)           │
└────────────────────────────────────────────────────────┘
```

### Key choices and why
- **Mobile-first, React Native.** The footage lives on the coach's phone. If upload isn't one tap from the camera roll, the product dies. Web is for review comfort and gym admins, not the primary loop.
- **Resumable, background uploads** (tus protocol / multipart to S3 with signed URLs). Gym wifi is bad; a failed 4GB upload is a churned customer.
- **Every pipeline stage is an idempotent worker consuming events.** Stages can retry, scale, and be swapped independently (e.g., replace the ASR model without touching rendering).
- **Rendering is template-driven, not generative.** Videos are composed by a deterministic engine (ffmpeg + a JSON "edit decision list" + caption/graphics templates) driven by AI *decisions*. AI decides *what*; deterministic code produces *pixels*. This keeps renders fast, cheap, on-brand, and debuggable.
- **Buy, don't build, at the edges:** managed ASR, managed LLM APIs, Stripe, Clerk, a social-publishing aggregator initially (e.g., an API like Ayrshire/Post-bridge class) until volume justifies direct platform integrations.

---

## 6. Database Structure (core tables)

```sql
coaches         id, auth_id, name, email, sport, specialty,
                plan, created_at

brand_profiles  id, coach_id, voice_summary, philosophy,
                tone_descriptors[], colors[], logo_url,
                audience, offers jsonb, goals jsonb,
                caption_style_prompt, version, updated_at

brand_memory    id, coach_id, kind (voice_sample|approved_caption|
                skip_reason|winning_post|athlete_note),
                content, embedding vector, created_at

athletes        id, coach_id, name (optional), face_embedding,
                consent_status (allowed|blocked|unknown), notes

sessions        id, coach_id, uploaded_at, status
                (uploading|processing|ready|reviewed),
                session_summary, duration_sec

media_assets    id, session_id, s3_key, kind (raw|proxy|render),
                duration, width, height, audio_quality_score

moments         id, session_id, t_start, t_end, type
                (teaching|transformation|hype|funny|story|
                technique|quote), score float, transcript_span,
                detected_athlete_ids[], reasoning text

content_pieces  id, session_id, moment_ids[], format
                (reel|tiktok|short|story|carousel|long_yt),
                edl jsonb,            -- edit decision list
                render_asset_id, caption, hook, hashtags[],
                cta, status (draft|approved|skipped|posted),
                skip_reason, platform_targets[]

schedule_slots  id, coach_id, content_piece_id, platform,
                scheduled_at, posted_at, external_post_id

post_metrics    id, content_piece_id, platform, views, likes,
                comments, shares, saves, profile_visits,
                link_taps, fetched_at

subscriptions   id, coach_id, stripe_customer_id, plan, seats,
                status, current_period_end

pipeline_jobs   id, session_id, stage, status, attempts,
                error, started_at, finished_at
```

Notes: `moments` is the crown jewel table — it's the labeled dataset. `edl` (edit decision list) makes every render reproducible and every "adjust" a cheap re-render. `athletes.consent_status` is a first-class citizen, not an afterthought (coaches film minors; see §17).

---

## 7. The AI Pipeline (from raw footage to finished pack)

**Stage 0 — Ingest & normalize.** Transcode to a mezzanine format, generate a low-res proxy, extract audio, score audio quality, run scene/shot detection, sample frames.

**Stage 1 — Understand.**
- ASR with word-level timestamps + speaker diarization (coach vs. athletes — the coach's voice print is known from onboarding).
- Vision pass on sampled frames: activity recognition (lifting, sprinting, pads, drills), rep detection, energy/motion scoring, face detection matched against the athlete roster.
- Audio prosody: excitement spikes, laughter, shouted cues, ambient hype.

**Stage 2 — Find the moments.** A multimodal LLM receives the fused timeline (transcript + visual events + audio energy + shot boundaries) and the Brand Brain, and outputs scored `moments` with types and reasoning: *"2:14–2:41 — coach delivers a mini-lecture on why sprinting fixes squat depth; clean audio; high engagement potential; type: teaching; score 0.91."* This is the intelligence heart of the product.

**Stage 3 — Compose.** For each top moment, a composer picks the best format(s) and emits an **EDL**: cuts, reorder for story (hook first — the *result* before the *setup*), caption timing, zoom/punch-in points, brand template, music slot, safe-crop for 9:16. Original storytelling patterns are drawn from a curated, regularly refreshed internal library of *structural* patterns (hook types, pacing curves, caption rhythms) — never from copying specific creators' content.

**Stage 4 — Write.** Text LLM, heavily conditioned on the Brand Brain (voice memo transcript, past approved captions, skip reasons), generates hook, caption, hashtags, and a CTA aligned with the coach's current business goal. If the goal is "fill the summer camp," CTAs point there.

**Stage 5 — Render.** Deterministic engine executes the EDL: burned-in captions in brand fonts/colors, logo bug, licensed music bed ducked under speech, loudness-normalized, per-platform encodes.

**Stage 6 — Rank & pack.** Deliver the top 6–10 pieces (never 40 — abundance is a burden), diversity-balanced across types (don't send five hype clips and no teaching), each with a suggested slot in the posting calendar.

**Stage 7 — Learn.** Approvals, skips, skip reasons, edits made in "adjust," and eventual post metrics flow back into `brand_memory`. The composer and writer read this memory on every future run. **This loop is the moat.**

---

## 8. Content Generation Engine — formats & rollout

| Format | What it is | Ships |
|---|---|---|
| Reels / TikTok / Shorts | 15–60s vertical, captioned, branded | **MVP** |
| Captions, hooks, hashtags, CTAs | Generated with every piece | **MVP** |
| Posting schedule | Auto-slotting into optimal times | **MVP** |
| Instagram Stories | Quick behind-the-scenes cuts w/ stickers | v1.1 |
| Carousels | Teaching moment → text slides + frames | v1.2 |
| Thumbnails & titles | For YouTube pieces | v1.2 |
| Long YouTube videos | Multi-session compilations, weekly recap | v2 |
| Cross-session series | "Marcus's 12-week transformation, Ep. 4" | v2 |

The engine's quality bar: **a piece is only surfaced if the coach would plausibly post it as-is.** Better to return 4 great pieces than 10 that need fixing. Internal metric: approval rate per pack (target >60%).

---

## 9. Export & Publishing System

- **Default path: direct publish.** Approved → scheduled → auto-posted via Meta Graph API (Reels, Stories), TikTok Content Posting API, YouTube Data API. First-comment hashtags where appropriate. Retry + failure alerts ("TikTok rejected the post — tap to fix").
- **Fallback path: one-tap export.** Watermark-free downloads (paid plans), correct specs per platform, caption copied to clipboard, deep-link into the target app. Critical for coaches who insist on posting manually and for platforms with API limits.
- Every render also lands in a simple **Library** (searchable by athlete, moment type, date) — coaches reuse clips for ads, websites, and athlete recruitment.

## 10. Social Scheduling

- Sideline proposes the calendar; the coach never builds one. Slot logic: platform best-practice times → refined by the coach's own audience activity once metrics accumulate.
- Sustainable cadence enforced by design: the scheduler spreads a session's content across the week rather than dumping it, and banks surplus approved pieces for no-footage weeks (**"Content Savings Account"** — quietly one of the most loved features, because it kills the guilt of a missed week).
- Coach controls are minimal: pause everything, blackout dates, per-platform on/off. That's it.

---

## 11. Subscription System

Anchor: *a social media manager costs $1,500–3,000/month.* Sideline is priced as an employee, billed as software.

| Plan | Price | For | Includes |
|---|---|---|---|
| **Starter** | $49/mo | New coaches testing | 4 sessions/mo, 20 posts, 2 platforms, watermark-free |
| **Pro** ★ | $99/mo | The core ICP | Unlimited sessions*, all platforms, auto-posting, Sunday Report, Content Savings Account |
| **Gym** | $249/mo | Small gyms | 5 coach seats, shared brand kit, one approval inbox, gym-level analytics |
| **Academy** | Custom | Academies/clubs | Teams, parent-safe consent workflows, recruiting reels |

*Fair-use cap on processing minutes; overage priced transparently. Free trial = **one full session processed end-to-end** (the aha moment), no time-limited trial — value-limited, not time-limited. Stripe for billing; usage metering on processing minutes and posts; dunning + pause-instead-of-cancel flow (coaches are seasonal — off-season pause at $9/mo retains the Brand Brain and the customer).

---

## 12. MVP vs. Later — the ruthless cut

**MVP (build in 12–16 weeks, 5 people):**
1. Mobile app: upload, review stack, schedule strip (3 screens)
2. Onboarding Acts 1–5 incl. Instagram scrape + voice memo
3. Pipeline stages 0–7 for **one vertical format** (Reels/TikTok/Shorts share it)
4. Captions/hooks/hashtags/CTA generation
5. Auto-posting to Instagram + TikTok (via aggregator API)
6. Export fallback
7. Stripe billing, Starter/Pro
8. Sunday Report v1 (reach + best post + one suggestion)

**Explicitly NOT in MVP:** carousels, long YouTube, thumbnails, web app beyond a review page, gym seats, ads manager, DM tools, A/B testing, analytics dashboards, template marketplaces, manual editing beyond trim + caption edit. Each of these fails the test at MVP stage: they add decisions before the core loop has proven it removes them.

**Sequence after MVP:** v1.1 Stories + Content Savings Account → v1.2 carousels + YouTube Shorts/thumbnails → v1.5 Gym plan + web review → v2 long-form YouTube + cross-session storylines.

---

## 13. Growth Roadmap

- **Phase 1 — Founder-led (0→100 customers):** DM 500 coaches whose content is clearly raw phone footage. Onboard personally. Obsess over approval rate and week-4 retention. Every early customer's posts are our billboard.
- **Phase 2 — Built-in virality (100→1,000):** a tasteful, optional "🎬 by Sideline" end-card *earns the coach a discount* — the product markets itself on every post to an audience full of other coaches. Referrals: give a month, get a month. Case-study engine: "Coach adds 11 clients in 90 days" content, made *with* Sideline.
- **Phase 3 — Channels (1,000→10,000):** partnerships with coaching certifications (NSCA, USA Boxing clubs, academy networks), gym software integrations, sport-specific landing pages ("Sideline for Boxing Coaches") each with sport-native demo content.
- **North-star metric:** approved posts published per coach per week. Everything (activation, retention, revenue) follows it.

## 14. Mobile & Web Apps

- **Mobile (primary):** the three screens of §4, background upload, push notifications as the product's heartbeat ("Your content is ready"). Optional **Capture Mode**: a one-tap in-app camera that timestamps moments when the coach taps mid-session ("that was gold") — a hint, not a requirement.
- **Web (secondary):** big-screen review stack, Library, gym-owner console (multi-coach approval inbox, brand kit management), billing. No feature exists on web that creates a dependency on desks — coaches don't have desks.

## 15. Scalability

- Stateless workers autoscale on queue depth; GPU stages (ASR, vision) batched; proxies keep vision costs low (analyze 480p, render from source).
- Cost discipline: target COGS <20% of subscription price per coach (processing minutes are the cost driver — hence fair-use caps and proxy-based analysis).
- Regional storage (US/EU) for privacy; CDN for renders; EDL-based re-render means "adjust" costs cents, not a full pipeline run.
- Model layer is provider-agnostic behind an internal interface — models will improve monthly; the pipeline shouldn't care.

## 16. Future AI Features (each still passes the time-saving test)

- **AI Voice Notes → Content:** coach rambles for 90 seconds in the car; Sideline turns it into a talking-caption post over B-roll from the Library.
- **Storyline Engine:** automatically tracks each athlete across sessions and pitches multi-part transformation series.
- **The Closer:** Sunday Report grows into lead handling — drafts replies to "how much is training?" DMs in the coach's voice, books consults into their calendar. This is the endgame: **Sideline stops being a marketing employee and becomes the front office.**
- **Auto A/B hooks:** posts two hook variants of the same clip as Story vs. Reel, learns silently.
- **Sponsor-ready media kits:** auto-generated from real metrics for coaches chasing brand deals.

## 17. Trust, Safety & the Unsexy Essentials

- **Athletes are often minors.** Consent is first-class: per-athlete allow/block via face matching, one-tap "never post this athlete," blur-face option, academy plans with parent consent workflows. This is both an ethical requirement and an enterprise sales feature.
- **Music licensing** via a licensed catalog (or platform-native sounds on direct publish) — never scraped audio.
- Original content only: the engine learns *patterns* (structures, pacing), never reproduces creators' material.
- Coach owns all footage and outputs; deletion is real deletion.

---

## 18. UX Wireframes (described)

**W1 — Today:** Full-bleed warm gradient card, centered: "⬆ Upload today's training" in 28pt. Beneath: thin pill "6 ready to review →" and a horizontal strip of 3 tiny scheduled-post thumbnails with day labels. Tab bar: Today · Review (badge) · Business. Nothing else.

**W2 — Uploading:** Camera-roll grid, multi-select, single button "Send to your employee." Then a calm full-screen state: circular progress, "You can close the app — we'll text you when it's ready." No spinners begging for attention.

**W3 — Review card:** 9:16 video fills the screen, autoplaying muted with burned captions. Bottom sheet peeking: platform chips (IG · TT), suggested time "Tue 6:12 PM," first line of caption. Swipe right → card flies into a small calendar icon (subtle, satisfying). Swipe left → three-chip skip-reason sheet, dismissible. Tap → full caption, hashtags, "Adjust" (trim handles + caption edit only).

**W4 — Done state:** "Your week is handled." A quiet 7-day strip with filled dots. One line: "Next: film Thursday's session." Close.

**W5 — Sunday Report:** Card stack: big number "4,218 people reached," best post replay, "3 DMs about training," one suggestion card with a single button: "Remind me Thursday."

**W6 — Onboarding voice memo:** Black screen, single pulsing record button, the prompt in large serif type: *"What do most coaches get wrong?"* 60-second ring. Skippable, but designed to be irresistible.

Design language: generous whitespace, one accent color derived from the coach's own brand, SF-style type scale, no icons where a word is clearer, motion used only to confirm decisions (the approve-fly-to-calendar). Apple-simple means fewer elements, not smaller ones.

---

## 19. The Test, Applied

Every feature above was passed through *"does this save the coach time?"* Casualties of that test, for the record: analytics dashboards (replaced by one weekly report), a timeline editor (replaced by trim handles), content calendars you drag things around on (replaced by auto-slotting), template pickers (replaced by the brand kit doing it silently), and AI chat ("ask Sideline anything") — because a chat box is a blank page, and blank pages are homework.

**The bar for shipping anything:** the coach's weekly time inside the app stays under five minutes, and their business grows anyway. That's the whole company.
