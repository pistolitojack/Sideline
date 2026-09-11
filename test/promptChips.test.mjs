// Regression suite for prompt-source classification (Phase 3.3). Pure logic,
// no database — every path a coach can take through the request box.
import { classifyPrompt, PROMPT_CHIPS } from "../lib/promptChips.ts";

let pass = 0, fail = 0;
const t = (name, text, chip, want) => {
  const got = classifyPrompt(text, chip);
  const ok = got === want;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}\n        ${got}${ok ? "" : `  want ${want}`}`);
  ok ? pass++ : fail++;
};
const hype = PROMPT_CHIPS.find((c) => c.id === "hype");

console.log("--- the five paths from the plan ---");
t("tap a chip, send unchanged   ", hype.prefill, "hype", "chip_unchanged");
t("tap a chip, edit it          ", hype.prefill + ", focus on the box jumps", "hype", "chip_edited");
t("tap a chip, replace it       ", "Just show the med ball work", "hype", "chip_replaced");
t("type freeform, no chip       ", "Cut me something for Instagram", null, "freeform");
t("send empty                   ", "", null, "empty");

console.log("\n--- edits that must stay 'edited' ---");
t("trimmed down                 ", "Make a hype reel", "hype", "chip_edited");
t("word swapped                 ", "Make a hype reel from today's box jumps", "hype", "chip_edited");
t("prefix added                 ", "Please make a hype reel from today's session", "hype", "chip_edited");

console.log("\n--- replacements that must NOT read as edits ---");
t("different ask entirely       ", "Teaching breakdown of the rotational throws", "hype", "chip_replaced");
t("one shared word only         ", "Something for today", "hype", "chip_replaced");

console.log("\n--- edge cases ---");
t("chip tapped then box cleared ", "   ", "hype", "empty");
t("whitespace around a prefill  ", `  ${hype.prefill}  `, "hype", "chip_unchanged");
t("case differs from prefill    ", hype.prefill.toUpperCase(), "hype", "chip_edited");
t("unknown chip id              ", "anything at all", "bogus", "freeform");
t("null text                    ", null, null, "empty");

console.log("\n--- every chip sends unchanged correctly ---");
for (const c of PROMPT_CHIPS) t(`  ${c.label.padEnd(20)}`, c.prefill, c.id, "chip_unchanged");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
