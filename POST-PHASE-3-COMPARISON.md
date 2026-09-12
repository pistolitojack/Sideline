# POST-PHASE-3 COMPARISON — the Data Phase

Baseline: 2026-09-11, commit `b9db572`, before any Data Phase item.
Now: 2026-09-12, all eight items live.
Both runs: **3 videos, empty prompt**, same coach, same kind of footage.

---

## 1. The numbers

|  | baseline | now |
|---|---|---|
| pieces | 3 | 3 |
| `hook_too_long` | 3 | **2** |
| `footage_repeated` | 2 | 2 |
| **total flags** | **5** | **4** |
| pieces with zero flags | 0 | **1** |
| hook lengths (words) | 10 / 16 / 18 | **4 / 11 / 15** |

The phase was not supposed to improve output — it was supposed to make output
*learnable from*. Flags were expected to hold flat. They came down slightly,
and one piece is clean for the first time.

## 2. The result that matters

The coach skipped a montage on 2026-09-11 with the note **"the same clip played
twice."** That single sentence travelled the whole way through the system:

1. Stored as `skip_reason_text` (item 3.4)
2. Loaded into the director's brief (item 3.6)
3. The director wrote it into both multi-shot recipes:
   *"Each clip gets 6-10s minimum so the movement lands before the cut."*
4. The composer delivered it:

| | shot lengths |
|---|---|
| baseline montage | 2.0 \| 4.0 \| 4.5 \| 5.7 \| 2.5 |
| this session's multi-shot piece | **6.0 \| 5.5 \| 6.0 \| 5.7** |

**Shortest shot: 2.0s → 5.5s.** Nothing in this phase touched a cutting rule.
That change came from the coach saying something once.

This is the first time in the project's history that a quality change can be
*attributed* rather than felt. It is the entire point of the phase.

Note also that two shots landed exactly on 6.0s — the per-shot ceiling in
`composePlannedPiece`. The editor wanted longer and the safety rail stopped it.

## 3. The director visibly used memory

From `director_notes`, unprompted:

> "Last time a single freeze-frame on the box jump crushed it, and a story piece
> showing your philosophy performed. We're going to lean into both of those
> strengths again."

Accurate recall of the two approved pieces, used to shape the plan.

## 4. Two problems this run exposed

### a. The over-fit, at a level we did not fix

> "We're skipping montage since that format got rejected."

**One** rejected montage and the format was dropped. The craft/preference split
(3.7b) hardened the *reflection* path — but this conclusion came from the raw
history block, which shows a bare `montage: kept 0 of 1 (0%)` with no sample
size and no context. One path was hardened and the other left open.

Partly self-limiting: the director then built a `pov` piece that is three drills
threaded together — a montage in all but name — so no content was actually lost.
The reasoning was still wrong.

### b. `footage_repeated` has a root cause upstream of the editor

The story piece draws on **one 17.1-second video** and was given a target of
**30 seconds**. It produced 24.1s. It *had* to replay footage; there was nothing
else to use. This is not an editing failure — the director planned a length the
footage cannot support, and no amount of careful cutting fixes that.

## 5. Is the data visibly richer?

Yes, and it is the difference between the two runs.

| signal | baseline | now |
|---|---|---|
| structural flags per piece | none | 7 checks, stored |
| why a piece was rejected | 3 vague options | 5 diagnostic reasons + the coach's own words |
| how a decision was made | nothing | dwell time, detail opened, revision count |
| how work was requested | free text only | chip, source, length, dwell |
| what the AI concluded | nothing | craft lesson / preference note, kept separate |
| which prompts built a piece | nothing | `d1·c1` stamped |
| founder calibration | nothing | 4 scales + notes on any piece |

## 6. The coach's read

> "The output was definitely better. Cleaner. It had one mistake in the cutting,
> but it wasn't as bad as it was before. I'm happy with what the output was."

And on direction:

> "The main goal is that the AI keeps learning and not making hard rules unless
> the coach tells them to, and that it focuses more on the editing than making
> rules about not creating montages, story clips or anything like that."

## 7. Honest assessment

**The phase did what it set out to do.** Every signal the product can observe is
now recorded, the AI receives it, and — demonstrably, on this run — acts on it.
Quality did not regress, which was the actual bar.

**The loop the coach wanted is real and running**: he said one sentence about a
cut, and the next session's cut was different in a way we can point to in the
data.

**But the failure mode he is most worried about is live.** The AI is still
willing to turn one bad example into a standing rule about a whole format. It
was fixed in the reflection path and missed in the raw-history path. That is the
top of the next list, and unlike a month ago, we can now prove whether the fix
works.
