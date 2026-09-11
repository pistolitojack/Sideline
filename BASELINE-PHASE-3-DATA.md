# BASELINE — before the Phase 3 Data Phase

Captured 2026-09-11 on commit `b9db572` (the reverted worker + the three
guardrails + the objective scorecard). This is the state every later item in
the Data Phase gets compared against.

Conditions: 3 varied videos, **empty prompt** (`sessions.prompt = NULL`) — the
same conditions as the original pre-Phase-3 baseline, so the two are
comparable.

---

## The director's plan

Prompt: none. The director read the footage as med-ball floor crawl work,
rotational throws, and box jumps, and planned three pieces — a montage, a
story, and a single.

Per-piece intent, as the director wrote it:

- **montage** — "A high-energy montage showing three different drills in one
  cut tells parents and young athletes exactly what a session here looks like —
  this is the brand-builder we need right now."
- **story** — "Parents choosing a trainer want to see a philosophy, not just a
  drill — this piece gives them a beginning-to-payoff narrative that makes the
  program feel intentional and trustworthy."
- **single** — "The box jump is the most scroll-stopping visual we have —
  isolating it as a standalone reel maximizes its reach and gets youth athletes
  hyped about training here."

---

## The three pieces

| kind | coach's call | shots | total | shot lengths (s) | flags |
|---|---|---|---|---|---|
| montage | **skipped** | 5 | 18.6s | 2.0 \| 4.0 \| 4.5 \| 5.7 \| 2.5 | `footage_repeated`, `hook_too_long` |
| story | approved | 5 | 22.4s | 4.0 \| 6.0 \| 4.2 \| 2.5 \| 5.7 | `footage_repeated`, `hook_too_long` |
| single | approved | 1 | 7.5s | 7.5 | `hook_too_long` |

### Hooks (the scorecard's limit is 8 words)

| words | hook |
|---|---|
| 10 | "Mid-air off the box — no setup, no intro. Just work." |
| 16 | "Every elite athlete started with the basics. This is how we build speed the right way." |
| 18 | "Freeze at the peak — this is what explosive power looks like when you train it the right way." |

### Copy

Full caption/CTA/hashtag text for all three pieces is in the session record.
Two observations that carry forward from the first baseline:

- **"Right?" still appears** in two of three captions ("This is exactly what
  training looks like with us. **Right?**" / "Most people want to skip to the
  flashy stuff. **Right?**"). It was in all three captions of the original
  baseline too. This is a voice tic, not a bug, and nothing in this phase
  addresses it — logged rather than fixed.
- **Every CTA is a DM/comment variant.** Same as the original baseline.

---

## The coach's read (verbatim in substance)

> "There was some mistakes on the cutting, but it was back at the baseline, and
> it wasn't as bad as it was. There wasn't text overwritten on anything, and it
> had a game plan. Two good videos and one bad cutting video."

> "One positive: when it generated the video, I sent it back to the editor and
> told it what I wanted. It accidentally cut twice in the span of one second, so
> it looked really bad. I told the editor to get rid of that and just make it
> fluid off the transition — and it did."

So: **2 of 3 approved, 1 skipped, and the revision loop worked** — the coach
described a specific defect in plain English and got back the fix he asked for.

---

## What the scorecard caught that the coach's eyes did not

This is the first evidence that the measurement layer is worth having.

1. **`hook_too_long` on all three pieces** — 10, 16 and 18 words against a
   limit of 8. The coach did not mention hooks at all in his critique. Long
   hooks are a real short-form weakness (the text has to be readable in the
   first second of a scroll), and this is now a number we can track instead of
   a thing nobody noticed.
2. **`footage_repeated` on exactly the two multi-shot pieces** — the same clip
   cut in twice with overlapping time ranges, which plays as a visible jump
   backwards. This is very likely the same defect the coach described as "it
   accidentally cut twice in the span of one second." The flag found it
   automatically, on both pieces, before he watched either one.

Note the correlation worth watching: the only piece the coach **skipped** was a
piece carrying `footage_repeated`. One session is not evidence, but this is
precisely the kind of link items 3-5 are being built to accumulate.

---

## Scorecard verification

`short_check` and `overlap_check` returned **match** on all three rows — the
worker's JavaScript and an independent SQL reimplementation agree on real
session data, not just on unit tests.

One inaccuracy was found and fixed while reading these results: a spaced em
dash (the house style — used in two of the three hooks) was being counted as a
word, inflating those hooks by one. Corrected; hook counts above are post-fix.

---

## Baseline flag totals (the numbers to beat, or at minimum not to worsen)

```
pieces:            3
hook_too_long:     3  (100% of pieces)
footage_repeated:  2  (100% of multi-shot pieces)
captions_overlap:  0
piece_too_short:   0
segment_too_short: 0
segment_too_long:  0
captions_run_past_end: 0
```

Nothing in the Data Phase changes how the AI decides, so at the end of the
phase these counts should be **roughly unchanged**. If they rise, something
broke that we did not intend — that is the whole point of writing them down.
