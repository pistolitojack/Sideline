# Sideline — Build Progress

## Item 6 — multi-select on sport, audience and mission (2026-10-05) ✅

**The first change driven by someone other than the founder.** Jack's dad ran
onboarding and the complaint was that the chip groups only allow one answer.

- **Sport** — unlimited. A coach doing speed & agility AND strength had to pick
  one, and the AI reads sport in all five stages, so the other became a lie five
  times over.
- **Audience** — unlimited. Youth plus high school is a common pairing.
- **Mission** — capped at **two**, deliberately. Every call-to-action is aimed at
  the mission. A coach who coaches two sports genuinely coaches two sports and
  the AI can serve both; a coach whose mission is all four has given the writer
  nothing to aim at, because "everything" and "nothing" reach the model
  identically. Two is a priority, four is a shrug. Unselected chips fade once two
  are picked, so the limit is visible rather than a tap that appears to do
  nothing.

**Stored comma-joined in the existing text columns** — `"Speed & agility,
Strength"`. The prompts interpolate the value as-is, so the model reads it
correctly with NO migration and NO prompt change. Moving to `text[]` would have
meant editing five prompt sites for a difference the model cannot see.

**Custom text is now additive rather than exclusive.** Previously typing in the
"Something else" box silently replaced the chips; with multi-select, "Strength"
and "volleyball" is a real answer and both are kept.

**Pre-fill splits the stored string back into chips**, handing anything the chip
list does not recognise back to the free-text box — otherwise a coach who typed
"volleyball" would re-open onboarding to find it gone. 13 round-trip cases
checked, including values containing commas and ampersands, and legacy
single-value rows written before this change.

## Item 5 — city and state as two fields (2026-10-04) ✅

**Found in real data.** The founder's own row came back with `city = "GA"` — the
state, in the city column. The input was a single box whose placeholder already
read "City, State", so the hint existed and still did not elicit both halves. One
box asking for two things reliably gets one of them, and which one is a coin
toss: the director then builds location hashtags from either a city with no
region or a region with no city.

**Fixed:** `state` column (`supabase/v13-coach-state.sql`), two inputs in
onboarding and in Today's quick-add card, and the director's brief now reads
`based in: Atlanta, GA` instead of `city: GA`.

**Nothing is migrated automatically.** A row holding "GA" is wrong, but guessing
which half it is — and inventing the other — would put made-up data exactly where
the AI reads it as fact. That is the failure the last two items removed, and it
is not worth re-introducing to save one UPDATE. Existing coaches fix it through
the "Edit your Coach DNA" route that item 4 added.

Director fingerprint moved `77e94e69` → `fde1a741`, by itself, because its prompt
changed. Third time the automatic versioning has caught a change nobody would
have thought to record.

## Item 4 — P2: a way back into onboarding, and pre-fill (2026-10-04) ✅

**The problem.** Nothing in the app linked to `/onboarding`, and the only
automatic redirect fired for a coach with no profile at all. Changing your sport,
your tones or your mission meant knowing to type the URL — and the form did not
pre-fill, so re-running it meant retyping everything or silently overwriting good
answers with defaults. Everything the AI believes about a coach was effectively
write-once.

**Fixed:** an always-visible "Edit your Coach DNA" card in Today, and onboarding
now loads the existing profile into every field. A sport that no chip offers is
restored into the "Something else" box rather than silently matching nothing.
Returning coaches get different copy and a "Save changes" button instead of being
greeted as strangers.

**The trap pre-fill would otherwise have sprung.** `voice_memo_transcript:
transcript || null` wiped the memo whenever a coach did not re-record — which did
not matter while re-running onboarding was obscure, and would have started
destroying data the moment this change made it normal. The key is now omitted
unless there is a new recording, the same fix the Instagram summary needed for
the same reason. The voice memo is the composer's only sample of how a coach
actually talks.

**P3 is substantially fixed by this.** "Mission is a snapshot that never updates"
was mostly a consequence of there being no way to update anything. A coach can
now change it in four taps. What remains is whether the app should ever *prompt*
a revisit — a product decision, not a defect, and better made after watching a
real coach than guessed at now.

**P4 and P5 deliberately not done.** Both are open questions from the handover
note rather than defects, and both change what the AI writes:
- **P4** (use the voice memo's content, not just its style) means loosening the
  composer's "copy STYLE only, NEVER its topic" rule. That rule is load-bearing:
  copy describing a different exercise than the video showed was one of the
  September failures. It is the first judgment-layer change since then and
  deserves its own item with a before/after flag count — which is exactly what
  the scorecard and the fingerprints were built to make possible.
- **P5** (ask for a real caption instead of tone adjectives) adds a question to a
  mobile-first flow whose north-star rule is to remove decisions, to solve
  something the Instagram scrape already partly covers (it captures caption
  length, emoji use and phrasing).

Doing either untested, the day before the first session with a coach who is not
the founder, is the exact pattern that cost this project a month.

## Item 3 — onboarding stops lying to the AI (2026-10-04) ✅

**The rule now applied throughout: a pre-selected answer is worse than no
answer.** A blank reaches the AI as `sport / focus: ?` and it knows it is
guessing. A default reaches it as a fact and it reasons confidently from a lie —
and nothing downstream can tell them apart, because a coach who tapped straight
through and a coach who meant it look identical in the database.

**The worst thing found, which was not on the P1–P7 list.** The Coach DNA screen
printed, to anyone who entered an Instagram handle:

> Audience read from your page: **youth athletes & their parents**

Hardcoded static text. Nothing read it from their page. It was left over from
when `audience` was hardcoded for every coach, and it did two kinds of damage:
told the coach a fabricated fact about themselves, and primed them to accept the
same answer on the audience screen two steps later — quietly corrupting the one
field that had just been fixed. Deleted.

**What changed:**
- **Sport** — nothing pre-selected, plus a "Something else" free-text box, then
  required. P1 and P6 had to ship together: requiring an answer while offering
  only five options would have *forced* the lie instead of preventing it.
- **Mission** — nothing pre-selected, plus a "Not sure yet" chip. A real answer
  in one tap, rather than a required field pushing coaches to the least-wrong
  option, which is the same fiction in a new costume.
- **Tones** — nothing pre-selected and genuinely optional. Worth 2 AI uses, and
  the voice memo carries rhythm and word choice far better than five adjectives.
- **Brand colour** — untouched. It decides the burned-in caption colour; the AI
  never reasons from it, so a default there is not a claim about anyone.
- **Saves `null`, not `""`.** An empty string renders as a blank after the label,
  which reads like an answer nobody gave.

**A correction to the previous plan.** It was stated that no prompt changes were
needed, on the basis that the director renders `${coach.sport ?? "?"}`. That was
checked in one place and generalised. Four other sites — understand, compose,
revise, reflect — would have printed the literal word `null`. All now use the
director's existing `?? "?"` pattern. Mechanical: no reworded instructions, no
changed rules.

**Which made item 1 prove itself on real work.** Three prompt builders changed
and three fingerprints moved by themselves — compose `7b6b96c1`→`b4084ba4`,
revise `9c7278fe`→`dc084722`, reflect `d029d07b`→`3e1558f2` — while the director,
untouched, held `77e94e69`. Under the old hand-maintained map this would have
been four numbers to remember on a day spent thinking about something else.

**Still open (P2–P7):** no route back into onboarding and no pre-fill, so a
mistake needs SQL to fix; mission is still a snapshot that never updates; the
voice memo's content is still discarded in favour of its style. Deliberately not
guessed at — the next run with a real first-time user should decide the order.

## Housekeeping item 2c — make the cleanup log tell the truth (2026-10-04) ✅

**The problem.** Cleanup deletes a raw clip's file but keeps its `media_assets`
row on purpose — `moments` and every piece's edl reference raw asset ids, so
dropping the row would break the admin view and the learning history. With no
record of what had already been purged, each run recomputed the same paths, asked
storage to delete files that were long gone, and counted them as removed. The log
read **"cleanup done — removed 217 files" every six hours while deleting
nothing.** Since the log is how everything else gets verified, a number that
wrong is worse than no number.

**The fix.** `artifacts_purged_at` and `file_purged_at` on `media_assets`
(`supabase/v12-purge-tracking.sql`). Two columns, not one: a clip's wav and
transcript are worthless the moment its session finishes, while the clip itself
survives another 30 days so revisions keep working. They run on different clocks,
so one mark could never say which had happened. Renders need no mark — their rows
are deleted with their files, which is what makes a cleared reel legible.

**Order matters:** files are removed first, marks written second. If a removal
throws, nothing is marked and the next run retries. The reverse could mark a file
as purged while it was still sitting there, and nothing would ever look again.

Reading the marks is best-effort — before the migration those columns do not
exist, and cleanup working noisily beats cleanup refusing to run.

**Expect one more noisy run.** Existing rows start unmarked, so the first cleanup
after the migration re-reports 158 intermediates and 59 raw videos, deletes
nothing, and marks everything. Every run after that reports zero.

42 retention tests (107 across the worker).

### Where the storage actually landed

2,266.5 MB → **738.4 MB**, a 67% reduction, verified in SQL.

My estimate of ~75 MB was wrong: I assumed all 879.9 MB of raw footage was past
30 days. Only ~215 MB was. The remaining ~678 MB is recent footage still inside
its revision window and will age out by itself. The resting state is ~60 MB of
live reels plus whatever footage is under 30 days old.

2b confirmed working on real data the same day: the skipped reel decided more
than a day earlier lost its video (render rows 12 → 11) and kept its poster, and
no approved reel was touched.

## Housekeeping item 2b — retention windows on finished reels (2026-10-04) ✅

**The windows, as Jack chose them:**
- **Skipped: 1 day, video only — the poster is kept.** The app never shows a
  skipped reel again (Today, the day strip and the approved list all filter to
  approved/downloaded), so the file is dead weight the moment it is swiped away.
  One day rather than zero buys back the two things instant deletion costs: a
  mis-swipe stays recoverable, and the admin view can still play the reel that
  evening, which is where the bad ones get studied. The poster is 0.07 MB against
  the reel's 11.94 MB, so keeping the thumbnail costs 0.6% and leaves the admin
  view showing what was rejected next to the reason why.
- **Approved and downloaded: 60 days, video and poster both.** A coach approves
  a reel in order to post it, which happens in days. Sixty rather than 180 nearly
  doubles how many coaches fit under the storage plan (~75 vs ~40).

**Verified first:** deleting the video cannot affect what the AI learns.
`memory.js` and `reflect()` both read text columns only — `skip_reason`,
`skip_reason_text`, `revision_history`, `review_dwell_ms`, `detail_opened` — and
neither touches storage. The sentence that moved the shortest shot from 2.0s to
5.5s lives in a text column and outlives the mp4.

**Pieces still awaiting review never expire**, however old. The coach has not
seen them; nothing should vanish in front of someone who never got to look.

**How a cleared reel stays legible.** Deleting the `media_assets` row is the
mechanism, not an afterthought: `content_pieces.render_asset_id` is a foreign key
declared ON DELETE SET NULL, so removing the row makes the piece report "no
video" by itself, with no new column and no broken player.

That exposed a bug waiting to happen: `rendering` was computed as "no mp4", so
every cleared reel would have told the coach **"Video still rendering — check
back in a minute"** forever. A piece only reaches a decided status after it
rendered and was reviewed, so a decided piece with no video was cleared, not
unfinished — `cleared` and `rendering` are now mutually exclusive. The cleared
state is deliberately not the rendering treatment: no spinner, no accent tint,
because nothing is coming and a spinner would promise otherwise.

**The point of the windows is not the megabytes.** Without them nothing is ever
deleted, so there is no steady state — every coach's footprint grows forever and
the "coaches per plan" figure shrinks every month. A window turns unbounded
growth into a ceiling.

36 retention tests (89 → 101 across the worker). Typecheck and build clean.

## Housekeeping item 2a — make cleanup actually run (2026-10-02) ✅

**What the dry run found.** 2,266 MB in the bucket, of which **1,091 MB (48%)
was orphaned reels and posters** and **221 MB (10%) was wav/transcript
leftovers**. Both categories already had collectors written inside `cleanup()`.

**Root cause: `cleanup()` had never run.** It was complete, registered in
`STAGES`, and nothing — not the worker, not the app, not a cron — ever queued a
cleanup job. Unreachable code, so 58% of storage was garbage it was written to
collect. The retention windows originally planned for this item would have freed
13.7 MB, or 0.6%, which is why the order was switched.

**Where the orphans came from:** the reset SQL that trimmed 73 pieces down to
ten (`media_assets` is keyed to the session, not the piece, so every deleted
piece left its mp4 and poster behind), every revision superseding a render, and
the app's "remove" action. None of it would have mattered if cleanup ran.

**Two latent bugs found and fixed before it ran for the first time:**

1. *Unchecked reads.* The old code destructured `{ data: pieces }` and ignored
   the error. On any failed read — a timeout, a dropped connection — `pieces`
   came back undefined, `pieces ?? []` became empty, nothing looked referenced,
   and **every reel in the account became an orphan**. Demonstrated against the
   real planner: a failed pieces read deletes 97 of 97 live reels. Reads now
   throw; a cleanup that cannot read does not delete.
2. *Unpaginated reads.* PostgREST caps rows per request. A truncated piece list
   is not a smaller cleanup, it is a wrong one — unseen pieces look
   unreferenced. All four reads are now paged to exhaustion.

**Design:** the deletion decision moved into `worker/src/retention.js`, pure and
I/O-free, so it can be tested without a live Supabase and real reels (20 tests,
most asserting that nothing is deleted). `cleanup()` keeps the I/O and does no
thinking.

**Trigger:** the worker's idle loop, NOT the job table. A job carries a session,
and `runJob()` marks it `processing` on entry and `failed` after two throws — so
a cleanup job would have bounced a finished session back to "processing", and a
storage hiccup would have told the coach their session FAILED over housekeeping.
It now runs 5 minutes after boot and every 6 hours, only when no job is pending,
and a failure is logged and forgotten. Tunable via `CLEANUP_INTERVAL_MS` and
`CLEANUP_FIRST_RUN_MS`.

**`CLEANUP_DRY_RUN=true`** logs exactly what would go and deletes nothing — the
intended first run on real data, given the function had never executed and was
about to remove a gigabyte.

**Also:** `artifactPath` moved to retention.js and is now shared with ingest.
Two copies of the same path rule is how cleanup ends up deleting nothing while
reporting success.

**A third bug, found when the first deploy logged nothing (same day).** `render()`
inserts the media_assets row and only THEN updates the piece to point at it;
`composePlannedPiece()` has the same gap for the poster. In that window a
freshly made reel is indistinguishable from an orphan. One worker never trips it
— cleanup runs only from the idle branch of its own loop — but a Railway
redeploy briefly runs two, and an idle one would have deleted the reel the busy
one had just made. Fixed by restricting orphan collection to sessions that are
`ready` or `failed`: an in-flight session's assets are unreachable no matter how
many workers exist, and cleanup's rule is now uniform (it only ever touches
finished sessions). Unreferenced files held back this way are counted and logged
rather than silently ignored, because a number that stays high means sessions are
getting stuck.

**Why the first deploy appeared to do nothing:** the first run was 5 minutes
after boot and the worker said nothing about it, so "waiting" and "not deployed"
and "never reached" all looked identical. Housekeeping that runs on a timer and
announces nothing is exactly how `cleanup()` stayed dead for a month. The worker
now prints its cleanup schedule at boot, which also proves a deploy picked up new
code, and the first run moved to 60 seconds (the redeploy race it was guarding
against is handled properly now).

**Not done here (2b):** the skipped-at-5-days and approved-at-180-days tiers,
and the "cleared to save space" state in Today that the approved tier needs.

**Real file sizes, replacing the business brief's guesses:** finished reel
11.94 MB (guessed ~10), raw clip 20.95 MB (guessed ~40 — overstated 2x), poster
0.07 MB.

## Housekeeping item 1 — automatic prompt versions (2026-10-02) ✅

**The problem.** Prompt versions were typed by hand in a `PROMPT_VERSIONS` map.
That only worked while someone remembered to bump it, and the failure mode ran
in the worst direction available: a forgotten bump did not leave the column
blank, it stamped the OLD version onto a NEW prompt. Two different prompts then
shared a version number, any comparison built on them was wrong, and nothing in
the data hinted at it. A column that lies quietly is worse than no column.

**The fix.** `worker/src/fingerprint.js` — a pure module that hashes the source
text of each prompt-building function into 8 hex characters. `stages.js` now
exports `PROMPT_FINGERPRINTS` instead of `PROMPT_VERSIONS`, computed once at
module load from `direct`, `composePlannedPiece`, `revise` and `reflect`.

Why hash the builder and not the finished prompt: an assembled prompt contains
the session's own data — frames, coach memory, transcripts — so it differs every
session and its hash would mean nothing. The builder's source is the recipe, and
it changes only when we change it.

What it deliberately over-reports: editing non-prompt logic inside the same
function also moves the hash. That is the safe direction of error — such edits
can change output too, and a hash that occasionally says "something changed"
when the wording didn't is far better than one that sits still while the wording
did. It can never miss a change.

**Migration:** `supabase/v11-prompt-fingerprints.sql` adds four text columns
(`director_prompt_fp`, `compose_prompt_fp`, `revise_prompt_fp` on
`content_pieces`, `reflect_prompt_fp` on `coach_reflections`) and carries the
comparison queries in its footer. The old integer columns are left in place
holding the hand-set version of every piece made before today — history, not a
running total. Pieces before the boundary have a version and no fingerprint;
pieces after have a fingerprint and no version, which makes the changeover
visible in the data instead of hidden inside it.

Fingerprints at the time of writing: director `77e94e69`, compose `7b6b96c1`,
revise `9c7278fe`, reflect `d029d07b`.

(An earlier draft of this entry recorded reflect as `124601b8`. That was measured
before the fallback retry was added inside `reflect()`, and adding it moved the
hash — which is the documented behaviour working correctly, and a good
demonstration of why the number should never be typed by hand.)

**Verified:** 15 new tests (69 across the worker). On the real code, a one-word
edit to the composer's instructions moved compose from `7b6b96c1` to `625e2871`,
reverting restored `7b6b96c1` exactly, and the director's hash never moved.
Telemetry fallback extended to the new columns, and the reflect insert now
retries without the fingerprint rather than losing the lesson.

**Known gap, left alone on purpose:** the `understand` stage builds a prompt and
has no version column at all — not a lying column, a missing one. Adding it is a
one-line migration whenever Jack wants it.

## Onboarding fixes (2026-09-13)

An audit of the onboarding flow ahead of a planning conversation turned up nine
issues (`ONBOARDING-COVER-NOTE.txt`). Two were fixed immediately because they
are unambiguous defects, not design questions:

- **P1 — `audience` was hardcoded.** Every coach was saved as "Youth athletes &
  their parents" while the AI read the field four times and treated it as fact.
  A coach training adult fighters or college athletes was silently mislabelled
  and every hook and CTA aimed at the wrong people. Onboarding now ASKS, on the
  screen that already covers mission: five options plus free text, **nothing
  pre-selected**, and Continue is disabled until they answer. A default here
  would be a confident lie the AI cannot tell apart from a real answer.
- **P3 — re-running onboarding always destroyed the Instagram scan.** The save
  set `ig_profile: null` unconditionally; the comment claimed "new handle" but
  the code never compared. Fixing a typo in your name wiped the scraped brand
  summary the AI uses five times. The page now loads the handle already on file
  and only clears the scan when it actually changed — omitting the key entirely
  otherwise, since upsert only writes the columns it is given.

Still open, and deliberately left for the planning conversation: pre-selected
defaults for sport/tones/mission (P2), no route back into onboarding from the
app (P4), the voice memo's content being discarded (P5), tones as adjectives
rather than writing samples (P6), no "other" for sport (P7), mission never
refreshing (P8), and nothing capturing what the content is FOR (P9).

## Phase 3 (v2) — The Data Phase ✅ COMPLETE

**Result (`POST-PHASE-3-COMPARISON.md`, 2026-09-12):** flags 5 → 4 across the
same 3-video empty-prompt test, one piece clean for the first time, hooks
10/16/18 words → 4/11/15. The headline is not the flag count though — it is
that Jack's skip note *"the same clip played twice"* travelled from the review
screen into the director's recipe and out into the edit: shortest shot went
**2.0s → 5.5s** with no cutting rule changed. First attributable quality change
in the project's history.

Both problems below are now FIXED (2026-09-12, director prompt v2):
1. The over-fit survives in the RAW HISTORY path. 3.7b hardened reflections,
   but the director read a bare `montage: kept 0 of 1 (0%)` and concluded
   "we're skipping montage since that format got rejected". FIXED: the block
   now states sample sizes, withholds percentages below 5 decisions, and says
   plainly that a rejected kind is a craft problem to fix rather than a format
   to stop making.
2. `footage_repeated` has an upstream cause: the director gave a 17.1s cluster a
   30s target, so the editor *had* to replay footage. FIXED in code:
   `normalizePlan` now sums the duration of each piece's assigned clips and
   trims the target to what actually exists (floor 8s). No prompt can fix a
   length that is physically impossible.


Nothing in this phase touches how the AI decides to cut, plan, or write. Every
item changes what the AI SEES or what WE CAN MEASURE.

- **3.1 Objective scorecard** ✅ built — `worker/src/scorecard.js`, a pure
  no-I/O module that runs seven structural checks on every finished piece
  before the coach sees it: `captions_overlap`, `piece_too_short`,
  `segment_too_short`, `segment_too_long`, `footage_repeated`, `hook_too_long`,
  `captions_run_past_end`. Flags are stored on `content_pieces.flags` (jsonb)
  by compose and recomputed by revise, since a revision rewrites the cut. The
  EDL now also carries `target_length_sec` so a revised piece stays scorable
  against the director's original target. A missing `flags` column can never
  cost a coach their reels — both writes retry without it and warn. Regression
  suite at `worker/test/scorecard.test.mjs` (`npm test` in `worker/`): 17 cases
  covering a clean piece, each check firing alone, boundary cases that must NOT
  fire (shots meeting exactly, captions touching exactly, an 8-word hook), and
  malformed input. `supabase/check-flags.sql` recomputes two checks
  independently in SQL to cross-verify against real data.
  Migration: `supabase/v9-piece-flags.sql`.
  **Verified on real data 2026-09-11:** all three pieces returned `match` on
  both the SQL cross-checks. The flags immediately earned their keep —
  `hook_too_long` fired on all three hooks (10, 16 and 18 words against a limit
  of 8), which Jack had not noticed at all, and `footage_repeated` fired on
  both multi-shot pieces, almost certainly the same defect he described as "it
  accidentally cut twice in the span of one second". Fixed one inaccuracy found
  while reading the results: a spaced em dash counted as a word. 19 tests pass.
- **3.2 Admin session view + founder ratings** ✅ built — `/admin/sessions`
  lists every session across every coach (status, piece count, flag count,
  rating progress, prompt); `/admin/sessions/[id]` shows the coach profile, the
  prompt, the director's plan JSON, and every piece with its poster, playable
  render, shot lengths, caption beats, copy and scorecard flags. Each piece
  carries a rating widget: four 1-5 scales (hook, pacing, copy, would-post)
  plus an optional note, written to `content_pieces`. Ratings are internal —
  never shown to the coach, and deliberately NOT fed to the AI (item 6 injects
  coach history, not these). *Deviation:* the plan specified an `ADMIN_EMAIL`
  env var, but an env var cannot gate the database — RLS is what actually stops
  one coach reading another's footage. Admin identity lives in a new `admins`
  table instead, so there is ONE setting rather than two that can disagree, no
  Vercel env var to configure, and no founder email committed to the repo.
  Migration: `supabase/v9-founder-ratings.sql` (rating columns + `admins` +
  `is_admin()` + additive admin read policies + an admin update policy).
- **3.3 Prompt chips at upload** ✅ built — five tappable starting points above
  the request box (Hype reel, Teaching breakdown, Motivational story,
  Behind-the-scenes, Client win), horizontally scrollable, one active at a
  time. Tapping fills the box with editable text; tapping the active chip again
  clears it. Nothing is required — an empty send is still first-class, and the
  director reads the same plain text field it always has. New placeholder per
  the plan. `sessions` now records `prompt_chip`, `prompt_source`,
  `prompt_length` and `prompt_dwell_ms` (screen-mount to send). Classification
  lives in `lib/promptChips.ts` as a pure function: `chip_unchanged` on an
  exact match, then word-survival against the prefill (≥50% = `chip_edited`,
  below = `chip_replaced`), `freeform` with no chip, `empty` for a blank box.
  A missing signal column can never cost a coach their upload — the insert
  retries without them. 20 tests in `test/promptChips.test.mjs` (`npm test`).
  Migration: `supabase/v9-prompt-signal.sql`.
- **3.4 Better skip reasons + the coach's own words** ✅ built — the skip sheet
  now offers Weak hook / Wrong energy / Boring cut / Off-brand / Athlete-person
  issue, each pointing at a different part of the pipeline so a pattern in them
  is diagnostic (hook = the writer, cut = the editor, off-brand = the
  director's read of the coach). Below them sits an optional single-line note:
  "what would've made it better?" — saved to `content_pieces.skip_reason_text`
  and surfaced on the admin piece view. *Design note:* tapping a reason now
  SELECTS rather than commits, so the note stays reachable; that costs one
  extra tap, and "Skip without saying why" still exits in one. Sheet state
  resets on open so a note can never ride along with a later decision. A
  missing column can't lose the decision — the update retries without it.
  Migration: `supabase/v9-skip-detail.sql`.
- **3.5 Review behaviour tracking** ✅ built — silent, never shown to the
  coach. `content_pieces` records `reviewed_at`, `review_dwell_ms` (card into
  view → decision), `detail_opened`, and `revision_count`. SwipeCard is keyed
  by piece id, so its mount IS the card appearing; the clock is stamped in an
  effect (reading it during render is impure). `onDecision` was refactored from
  a growing tail of positional arguments to a single `ReviewDecision` object,
  which is what made this additive rather than a fourth parameter. Revision
  counting goes through a `bump_revision_count` SQL function so two revisions
  in quick succession can't clobber each other. The admin piece view now shows
  "4.2s to decide · opened detail · 1 revision". A missing column still can't
  lose the decision — the update falls back to status + reason only.
  Migration: `supabase/v9-review-behavior.sql`.
- **3.6 Coach memory injection** ✅ built — `worker/src/memory.js` loads what
  the coach has actually done and hands it to the director as a
  "WHAT THIS COACH RESPONDS TO" section: approval rate by piece kind, the hooks
  they kept (with why each was made), the ones they rejected with reason and
  their own words, the changes they asked for, which chips they reach for and
  how they send them, and how long they look before deciding. Framed as
  observation — "decide for yourself what it means" — and explicitly ranked
  below this upload's request. Loading and formatting are separate so
  `formatCoachMemory` is pure and testable; 21 tests cover the preference
  signal, the wording guarantees, singular/plural, and malformed input. A coach
  with no decisions gets NO section rather than an empty scaffold, and a failed
  history query degrades to no memory rather than no reels. Founder ratings are
  deliberately excluded, per the plan. No migration needed.
  **Decision history was wiped first** (`supabase/reset-decision-history.sql`)
  — days of button-testing would otherwise have been fed to the AI as taste.
- **3.6b Revision notes survive a failed re-cut** — the app now writes the
  coach's request to `revision_history` the moment they send it, instead of
  waiting for the worker to finish. A revision killed mid-flight used to erase
  the single most useful signal in the system. The worker de-duplicates when it
  completes, so a request never appears twice.
- **3.7 Self-reflection after each session** ✅ built — a new `reflect` stage
  runs once a session is fully reviewed (the app queues the job when the LAST
  piece gets a decision). It reads what was made, what was kept, what was
  rejected and why — including the coach's own words and any revision requests
  — and writes 2-3 first-person sentences synthesising their taste. Stored in
  `coach_reflections` (one per session, enforced by a unique index). Memory
  then loads the last 5 and puts them at the TOP of the director's section, as
  "WHAT YOU'VE LEARNED ABOUT THIS COACH SO FAR" — conclusions first, evidence
  below. Reflections can carry the section alone when raw history is thin. The
  prompt explicitly permits "one session isn't enough to conclude anything"
  rather than forcing a pattern. A failed reflection never fails the job; the
  coach already has their reels. 27 memory tests pass.
  Migration: `supabase/v9-reflections.sql`.
- **3.7b Craft vs preference — the first reflection got it wrong, by design.**
  Jack rejected ONE badly-cut montage (repeated footage) and the AI concluded
  "prioritize standalone story-driven pieces over high-energy multi-drill cuts"
  — a menu rule from a kitchen problem, which would have reached every future
  session as fact. Root cause was the prompt: it asked what the AI learned
  about the coach's "taste", which points at *which kinds they like* when the
  feedback was about *how one was made*. Jack's framing: "the kinds are the
  menu; my feedback is about the cooking."
  The reflection now returns TWO fields — `craft_lesson` (required; applies to
  every kind) and `preference_note` (usually empty; needs a pattern across
  sessions) — so the mistake is structurally impossible rather than merely
  discouraged. The prompt names the exact failure, drops the word "taste", and
  is told the coach's LIFETIME decision count so it can tell 3 pieces from 300.
  Memory renders them as separate blocks, with the craft block explicitly
  labelled "not reasons to stop making any kind of piece". Old single-paragraph
  rows still read. 35 memory tests. The bad note is deleted by the migration.
  Migration: `supabase/v10-reflection-split.sql`.
- **3.8 Prompt version tracking** ✅ built — `PROMPT_VERSIONS` in
  `worker/src/stages.js` (director/compose/revise/reflect, all at 1). Every
  piece records the director and compose versions that made it, a revision
  records the revise version, and a reflection records the reflect version.
  Bumped BY HAND when a prompt changes meaningfully — deliberate, because
  bumping it is a statement that a change is worth measuring; the rule lives in
  `CLAUDE.md`. This is the ruler that makes the scorecard idea provable:
  "compose v1 averaged 2.1 flags per piece, v2 averaged 0.9" is a sentence that
  was impossible before. The admin piece view shows `d1·c1`.
  *Also fixed while here:* the missing-column fallbacks only dropped `flags`,
  so an unrun version migration would still have broken the pipeline. Replaced
  with a named `withoutTelemetry()` helper covering every measurement field, so
  the rule holds for anything Phase 3 adds later.
  Migration: `supabase/v10-prompt-versions.sql`.
- **Baseline captured** — `BASELINE-PHASE-3-DATA.md`: the plan, all three
  pieces with shot lengths and flags, Jack's verbatim read, and the flag totals
  every later item is measured against.

## Phase 3 — RESET to the baseline (2026-09-08)

Everything below this section describes work that has been **reverted**.
`worker/src/stages.js` and `worker/src/ffmpeg.js` are back to commit `8d3310a`
— the state whose output Jack accepted — plus the one confirmed fix that came
after it (`sanitizeForBurn`, the emoji/tofu fix he verified). `claude.js` keeps
prompt caching and truncation salvage: neither can change what the model
produces for a given prompt, only what it costs and whether a cut-off reply is
recoverable.

**What went wrong.** Five changes that alter how the AI decides were stacked on
top of each other with no measurement between any of them: thinking blocks
(3.2), motion-adaptive frame sampling (3.7), removal of the numeric pacing
rules, cut craft v1 (with motion beats + code-enforced clip assignment), and
cut craft v2 (with an overlap guard). The only feedback signal was Jack
watching the reels — minutes and ~$0.50 per data point, entirely subjective.
With a loop that slow and that noisy, errors accumulate faster than they can be
detected. They did.

**The finding that matters most: the numeric pacing rules were load-bearing.**
The baseline told the composer to build `3-6` or `5-10` segments and capped
non-single shots at 6s. Jack objected to time rules on principle — a reasonable
design instinct — and they were removed. Output got worse immediately and never
recovered. They are back, because the version that had them is the version that
worked. Whether they can be replaced by something better is now an open
question to be answered with measurement, not argued from principle.

**Three deterministic bugs Jack found in the last batch of 7 pieces**, none of
which are AI judgment problems — they are missing guardrails, and they can ship
broken output no matter how good the AI's decisions are:
1. *Captions overprinting.* The hook burns at y=1380 at 54px and wraps to up to
   3 lines (~150px tall); the body burns at y=1470. Any hook longer than one
   line that overlaps a body beat in time renders text on top of text. Nothing
   in the pipeline forbids two captions being on screen at once.
2. *Two-second reels.* There is no minimum piece length anywhere — a single
   surviving 2s segment ships as a finished reel. (Cut craft v2's overlap guard
   made this reachable by dropping segments after validation.)
3. *Copy describing the wrong exercise.* The composer picks segments from one
   moment while writing copy influenced by another moment's transcript. No code
   ties the copy to the footage actually used.

**Guardrails landed (2026-09-08, after the revert was confirmed on a real
session).** The three bugs above are fixed. Two are pure code and cannot make
output worse; the third needed a prompt line, flagged below.
1. *Captions can no longer overprint.* `orderCaptions()` sorts the beats and
   clips each one to end `CAPTION_GAP` before the next begins, so only one is
   ever on screen. When making room would leave the earlier beat unreadable,
   the earlier beat wins — losing a body line beats losing the hook. Applied to
   compose AND revise (revise had the same bug). Verified against six cases
   including Jack's exact symptom (hook 0-4s under body 2-6s), reversed JSON
   order, identical windows, and captions running past the end of the cut.
   Clean caption sets pass through untouched.
2. *No more two-second reels.* Each validated segment now records `max_out` —
   how far it could still run inside its own moment. A piece under
   `MIN_PIECE_SEC` (6s) is first repaired by letting its shots run longer, and
   only skipped (with the reason logged) if the footage genuinely isn't there.
   Verified: a 2s piece with room becomes 6s and ships; a 2s piece whose moment
   really is 2s long is skipped; a healthy 24s montage is untouched.
3. *Copy tied to the footage used.* **This one is a prompt change** — the only
   AI-behavior change in this batch, deliberately narrow: an additive line
   telling the composer the hook and captions must describe the segments it
   actually selected, and not to borrow words from a moment it didn't cut. It
   constrains copy only and cannot alter segment selection. Watch it.

**The plan from here**, in order, one at a time with verification between:
`revert (this commit)` → `guardrails for the three bugs above` → `an automatic
structural checker so quality stops depending on Jack watching reels` → the
Phase 3 **data** items only (3.3, 3.4, 3.5, 3.6, 3.8, 3.9). Item 3.7 stays out
until the checker can show it helps. This matches what Jack asked for: make the
data better without messing with the AI.

## Phase 3 — The AI Brain (REVERTED — kept below as the record of what was tried)

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
- **Cut-quality repair (3 changes).** Removing the pacing rules left a vacuum —
  the editor had no numbers AND no craft to replace them, and the cutting got
  worse than baseline. Three fixes, all kind-agnostic per Jack ("no matter what
  the AI decides it's going to be, I need the AI to be able to cut correctly"):
  1. **Motion beats reach the editor.** Ingest already measured where each clip
     spikes and threw the answer away. It now stores those seconds on
     `media_assets.motion_peaks`, and the compose prompt lists the beats inside
     every moment. Revision prompts get them too, so a re-cut doesn't cut worse
     than the original. Migration: `supabase/v9-motion-peaks.sql`.
  2. **Cut craft replaces the pacing rules.** One universal section, no
     per-kind numbers: every cut lands on a real beat (impact, landing,
     release, finish, direction change); no beat to cut on means hold longer; a
     shot holds a COMPLETE action, starting ~0.5s before the beat; shot count
     follows the footage's energy and every shot earns its place; fast means
     choosing short complete actions, never truncating long ones.
  3. **The director's clip assignment is enforced in code.** It was a prompt
     hint the editor could ignore, so pieces wandered into other clusters'
     footage. Segments are now filtered to the assigned clips after validation
     — in code, so the prompt still shows every moment and the cached prefix
     stays identical across pieces. Safety net: if enforcing would empty the
     piece, the editor's cut is kept instead.
- **Changes 1 and 3 above were REVERTED after the first real run** — they made
  the cutting worse, not better. Jack's three pieces all failed the same way:
  cuts landing *just before* the throw, and the same action shown twice.
  - **Why the beats hurt.** `tblend=difference` + `signalstats` measures
    WHOLE-FRAME pixel change. On handheld phone footage the camera moves more
    of the frame than the athlete does, so the "beats" track camera motion at
    least as much as action. Worse, `findPeaks` returns the *leading edge* of a
    spike (verified: synthetic spikes at 4.0/9.5/15.0s report as
    3.8/9.2/14.8s), and the prompt then said to start ~0.5s BEFORE the beat and
    gave no end-of-action data at all — so shots began ~1s early and ended as
    the action started. That is exactly "it cut right before he threw it." The
    prompt also said to trust the beats *over* the model's read of the frames,
    which put an unvalidated proxy signal above the one input that actually
    sees the athlete. The measurement still runs and is still stored; it just
    no longer touches the prompt.
  - **Why the enforcement hurt.** When the director assigns ONE clip to a
    multi-shot piece, hard-filtering forces every shot to come from that one
    video — the montage replays the same footage. Back to a prompt hint.
  - **Kept and reworded:** the cut-craft section, now framed around what the
    model can SEE ("start in the wind-up, hold through the release, end after
    it resolves"), plus an explicit ban on showing the same action twice and on
    cutting inside a single-clip demonstration.
  - **Added:** a code-level overlap guard. Two moments from `understand` can
    cover the same rep; any segment overlapping an earlier one on the same clip
    by more than half its length is dropped. Verified it kills exact, offset
    and nested repeats while preserving adjacent shots, small overlaps and
    A/B/A multi-angle cuts.
  - **Lesson:** the motion signal was never validated against real footage
    before it was wired into the prompt. Measure first, ship second.
- **3.7's frame budget was being thrown away — the real upstream bug.** Reading
  the stored peaks off Jack's session exposed it: three clips of 17s, 6s and 7s
  produced ONE peak each (two for the 7s). The peak threshold is the clip's own
  85th percentile, so a single large camera move raises the bar above every
  athletic action in the clip. But the worse half was the sampler: it placed 9
  frames in a ±2s window around the peak, then filled the rest of the clip at a
  fixed 3.5s interval and stopped — so the 17s clip asked for **14 frames when
  it was allowed 40**, with 9 of them bunched in one 4-second window. The
  `understand` stage was finding moments in a 17-second video while seeing the
  other 15 seconds through five stills. Wrong moments in, wrong cuts out — this
  sits upstream of every cut-quality change made so far.
  `framePlan` now spends the whole budget: emphasis around the beats (capped at
  half the budget, so the director's 4-frame allowance can't be swallowed by
  one peak window), then even coverage of the entire clip with what's left. On
  Jack's real clips at the `understand` budget: 17s → **38 frames, largest gap
  0.6s**; 6s → 21; 7s → 28. Over-budget clips now subsample evenly instead of
  taking peak-adjacent frames first — with 6 peaks in the first 11s of a 60s
  clip the old code stopped looking at 13s, the new one reaches 52.5s.
  A bogus peak now costs emphasis, never coverage.
- **Perf fix (my own regression, caught on the next run).** Measuring a clip's
  beats costs a FULL decode of the source, and three stages sample frames from
  the same clips — so adding the ingest measurement took a 3-video session from
  6 analysis passes to 9, and Jack noticed the slowdown immediately. Ingest now
  measures once and `sampleFrames` takes those stored peaks, so direct,
  understand and revise skip the analysis entirely: **9 passes → 3**, faster
  than before Phase 3 started. Verified the reused-peak frame plan is identical
  to the freshly-measured one, and a clip with no stored peaks still falls back
  to measuring.
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
