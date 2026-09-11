// Phase 3.6 — the memory text the director reads. Pure formatting, no database.
import { formatCoachMemory } from "../src/memory.js";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "  ok  " : "FAIL  "}${name}${cond ? "" : `  ${extra}`}`);
  cond ? pass++ : fail++;
};

console.log("--- a coach with no history gets NO section ---");
check("null history", formatCoachMemory(null) === "");
check("no sessions, no pieces", formatCoachMemory({ sessions: [], pieces: [] }) === "");
check(
  "pieces exist but none decided yet",
  formatCoachMemory({
    sessions: [{ id: "s1" }],
    pieces: [{ status: "ready", hook: "x", piece_kind: "montage" }],
  }) === ""
);

console.log("\n--- a coach who clearly prefers teaching ---");
const teachingCoach = {
  sessions: [
    { id: "s1", prompt_chip: "teaching", prompt_source: "chip_unchanged", prompt_length: 34 },
    { id: "s2", prompt_chip: "teaching", prompt_source: "chip_edited", prompt_length: 52 },
    { id: "s3", prompt_chip: null, prompt_source: "empty", prompt_length: 0 },
  ],
  pieces: [
    ...Array.from({ length: 10 }, (_, i) => ({
      status: "approved", piece_kind: "teaching",
      hook: `Teaching hook ${i}`, director_intent: "parents want to see a system",
      review_dwell_ms: 9000, detail_opened: true, reviewed_at: "2026-09-11",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      status: "skipped", piece_kind: "hype",
      hook: `Hype hook ${i}`, skip_reason: "Weak hook",
      skip_reason_text: i === 0 ? "needed to promise something specific" : null,
      review_dwell_ms: 3000, detail_opened: false, reviewed_at: "2026-09-11",
    })),
    { status: "approved", piece_kind: "teaching", hook: "Revised one",
      revision_history: [{ note: "let the rep finish before cutting" }] },
  ],
};
const out = formatCoachMemory(teachingCoach);
check("has the section title", out.includes("WHAT THIS COACH RESPONDS TO"));
check("frames history as observation, not command", out.includes("decide for yourself"));
check("says today's request still wins", out.includes("comes first"));
check("teaching kept 11 of 11", out.includes("teaching: kept 11 of 11 (100%)"), out);
check("hype kept 0 of 8", out.includes("hype: kept 0 of 8 (0%)"), out);
check("lists a kept hook", out.includes("Teaching hook 0"));
check("lists a rejected hook with its reason", out.includes("reason: Weak hook"));
check("includes the coach's own words", out.includes("needed to promise something specific"));
check("surfaces the revision note", out.includes("let the rep finish before cutting"));
check("reports chip habit", out.includes("teaching (2x)"), out);
check("reports dwell split", out.includes("before keeping") && out.includes("before rejecting"));
check("does NOT contain founder ratings", !/would_post|hook_rating|founder/i.test(out));

console.log("\n--- a coach with only one decision ---");
const thin = formatCoachMemory({
  sessions: [{ id: "s1" }],
  pieces: [{ status: "approved", piece_kind: "single", hook: "One and only" }],
});
check("still produces a section", thin.includes("WHAT THIS COACH RESPONDS TO"));
check("says 1 piece, not 1 pieces", thin.includes("decided on 1 piece."), thin);
check("no revisions block when there are none", !thin.includes("CHANGES THEY ASKED FOR"));

console.log("\n--- malformed input must not throw ---");
for (const bad of [{}, { pieces: null, sessions: null }, { pieces: [{}], sessions: [{}] }]) {
  try { formatCoachMemory(bad); check(`survives ${JSON.stringify(bad)}`, true); }
  catch (e) { check(`survives ${JSON.stringify(bad)}`, false, e.message); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
