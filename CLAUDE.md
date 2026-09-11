# Working agreement

Jack is a former coach, not a programmer. He directs, tests on a real phone,
and judges the output. Claude Code writes the code. These rules exist because
ignoring them cost this project a month in September 2026.

## Before starting any item

**Explain it first, in plain language, before writing a line of code.** Three
short things:

1. **What this item actually does** — in terms of the app and the coach, not
   the schema.
2. **What it makes better.**
3. **What it costs or risks** — honestly. "Nothing" is rarely true; if it is,
   say why.

No jargon, no file paths in the explanation. He should be able to decide
whether he wants it before any work happens.

## While working

- **One item at a time, in order.** Commit each separately.
- **Stop after each item** and report: what changed, how to verify it with real
  data, assumptions and edge cases. Wait for "verified, continue".
- **Give SQL as one complete, pasteable block**, in the order it must run.
  Splitting a migration across messages has caused the same error three times —
  he runs part two first and hits "relation does not exist".
- **Never reference a repo file path as an instruction.** He cannot
  conveniently open files; paste the contents.
- **Update PROGRESS.md after every item.**
- **Log out-of-scope ideas in IDEAS.md.** Do not build them.
- **After two failed patches on the same change, revert and rethink.** Do not
  patch a third time.

## Hard-won rules

- **Never change how the AI decides without a way to measure whether it
  helped.** Five stacked judgment changes with no measurement is what broke the
  product. The scorecard (`worker/src/scorecard.js`) exists so this is possible.
- **A missing database column must never cost the coach their work.** Every
  write that includes a new column retries without it. The coach's upload,
  reel, or decision matters more than the telemetry about it.
- **Pushing to `main` redeploys the Railway worker.** Do not push while he is
  mid-test; an in-flight job dies and is left marked running forever.
- **Secrets:** the service-role key lives ONLY in Railway. Never in Vercel,
  never in the browser, never in the repo.
- **When he pushes back on a design instinct, test it rather than agreeing.**
  Removing the numeric pacing rules because they "felt wrong" is exactly how
  quality collapsed. He would rather be told he is wrong with evidence.
