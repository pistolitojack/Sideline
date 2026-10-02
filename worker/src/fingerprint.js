// Automatic prompt versioning.
//
// WHY THIS EXISTS
// Phase 3.8 stamped every piece with a prompt version number typed by hand in
// a PROMPT_VERSIONS map. That only works if someone remembers to bump it. Miss
// one and the column doesn't go blank — it reports the OLD version for a NEW
// prompt, which is worse than having no column at all. A blank tells you you
// don't know; a stale number tells you something false and you build on it.
//
// So the version is no longer a decision. It's derived from the code that
// builds the prompt.
//
// WHY WE HASH THE FUNCTION, NOT THE PROMPT TEXT
// The obvious move is to hash the finished prompt string. That doesn't work:
// an assembled prompt contains the session's own data — sampled frames, the
// coach's memory block, transcripts, the clip list. It is different every
// single session, so its hash would change constantly and mean nothing.
//
// What we actually want to identify is the RECIPE, not the meal. The recipe is
// the source code of the function that assembles the prompt, and that text
// changes only when we change it.
//
// WHAT THIS DELIBERATELY OVER-REPORTS
// The fingerprint covers the whole function, so editing non-prompt logic
// inside it — a clamp, a loop — also moves the hash. That is the intended
// direction of error. Those edits can change the output too, and a fingerprint
// that occasionally says "something changed" when the wording didn't is far
// safer than one that stays put while the wording did. It can never miss.
//
// ONE DEPENDENCY WORTH KNOWING
// This reads Function.prototype.toString(), which returns real source text
// because the worker runs plain ES modules straight from src/ with no build
// step (see worker/Dockerfile). If a bundler or minifier is ever added, every
// fingerprint changes once, in one commit. That shows up as a clean break in
// the data rather than silent drift, but it is worth knowing before anyone
// wonders why every version rolled over on the same day.

import { createHash } from "node:crypto";

// Eight hex characters: 4.3 billion values, which is far more than a project
// with a few dozen prompt revisions will ever need, and short enough to read
// out loud and paste into a WHERE clause.
const FP_LENGTH = 8;

// Hash whatever text we're given. Separate from fingerprint() so the tests can
// check the hashing itself without building functions.
export function hashText(text) {
  return createHash("sha256")
    .update(String(text ?? ""), "utf8")
    .digest("hex")
    .slice(0, FP_LENGTH);
}

// The fingerprint of a prompt-building function.
//
// Returns null rather than throwing for anything that isn't a function. This is
// telemetry: a bad argument here must cost us a measurement, never a coach
// their reel.
export function fingerprint(fn) {
  if (typeof fn !== "function") return null;
  return hashText(fn.toString());
}

// Fingerprint several functions at once, as {name: hash}.
//
// Computed ONCE at module load and reused, because a function's source cannot
// change while the process is running. Re-hashing per session would be a few
// microseconds of waste, but more importantly it would invite the idea that
// these can drift mid-run. They can't.
export function fingerprintAll(fns) {
  const out = {};
  for (const [name, fn] of Object.entries(fns ?? {})) {
    out[name] = fingerprint(fn);
  }
  return out;
}
