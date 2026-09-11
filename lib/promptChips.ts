// Phase 3.3 — prompt chips at upload.
//
// Five tappable starting points above the request box. A chip only PREFILLS
// the text field; the coach can send it as-is, edit it, replace it, type from
// scratch, or send nothing at all. The director reads the same plain text
// field it always has — chips change nothing about how the prompt is consumed.
//
// What they add is signal: which starting point a coach reaches for, and
// whether they trust it enough to send unchanged. That becomes part of what
// the AI learns about them in item 6.

export type Chip = { id: string; label: string; prefill: string };

export const PROMPT_CHIPS: Chip[] = [
  {
    id: "hype",
    label: "Hype reel",
    prefill: "Make a hype reel from today's session",
  },
  {
    id: "teaching",
    label: "Teaching breakdown",
    prefill: "Teaching breakdown of the main drill",
  },
  {
    id: "story",
    label: "Motivational story",
    prefill: "A motivational story from today's training",
  },
  {
    id: "bts",
    label: "Behind-the-scenes",
    prefill: "Behind-the-scenes look at today",
  },
  {
    id: "win",
    label: "Client win",
    prefill: "A client win moment from today",
  },
];

export type PromptSource =
  | "empty"
  | "chip_unchanged"
  | "chip_edited"
  | "chip_replaced"
  | "freeform";

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);

// How much of the prefill survives in what was actually sent, 0..1.
function survival(prefill: string, text: string): number {
  const from = words(prefill);
  if (!from.length) return 0;
  const to = new Set(words(text));
  return from.filter((w) => to.has(w)).length / from.length;
}

// Below this, the coach kept the chip selected but wrote something of their
// own — "replaced" rather than "edited". Half the prefill's words surviving is
// a deliberately forgiving line: trimming a request or adding to it still
// reads as an edit, which is what we want to measure.
const EDIT_FLOOR = 0.5;

/**
 * Classify what the coach actually did with the request box.
 *
 * @param text      the final contents of the field
 * @param chipId    the chip currently selected, or null if none was tapped
 */
export function classifyPrompt(
  text: string,
  chipId: string | null
): PromptSource {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "empty";

  const chip = chipId
    ? PROMPT_CHIPS.find((c) => c.id === chipId) ?? null
    : null;
  if (!chip) return "freeform";

  if (trimmed === chip.prefill) return "chip_unchanged";
  return survival(chip.prefill, trimmed) >= EDIT_FLOOR
    ? "chip_edited"
    : "chip_replaced";
}
