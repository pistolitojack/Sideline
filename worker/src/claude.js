import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";

// Model pinned by SPEC.md.
export const MODEL = "claude-sonnet-4-6";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Mark the LAST block of a stable prefix (coach profile, sampled frames, voice
// memo, IG summary). Everything up to and including that block is cached by
// Anthropic and re-read cheaply by later calls sharing the same prefix.
// Caching only engages above a minimum prefix size (~1k tokens), which is why
// we mark image-heavy and profile blocks rather than short instructions.
export function cacheable(block) {
  return { ...block, cache_control: { type: "ephemeral" } };
}

export async function askClaude({
  system,
  content,
  maxTokens = 4000,
  label = "claude",
}) {
  // A string system prompt becomes a cached text block so it never re-bills.
  const sys =
    typeof system === "string"
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: sys,
    messages: [{ role: "user", content }],
  });

  const u = res.usage ?? {};
  const write = u.cache_creation_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  console.log(
    `  [tokens] ${label}: in=${u.input_tokens ?? 0} cache_write=${write} ` +
      `cache_read=${read} out=${u.output_tokens ?? 0}` +
      (read > 0 ? "  <- cache HIT" : "")
  );

  return res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export async function imageBlock(path) {
  const data = await readFile(path);
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/jpeg",
      data: data.toString("base64"),
    },
  };
}

// Pull the first JSON array or object out of a model reply, tolerating
// stray prose or code fences around it.
//
// Every stage now asks the model to reason inside a <thinking> block before it
// answers. That prose routinely contains braces and quotes, so it MUST be
// removed before we hunt for the JSON payload — otherwise the bracket walker
// locks onto a brace inside the reasoning and fails to parse.
export function extractJson(text) {
  const cleaned = String(text)
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    // An unclosed <thinking> means the reply was cut off mid-reasoning; there
    // is no JSON after it, so drop the tail.
    .replace(/<thinking>[\s\S]*$/i, "");
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : cleaned;
  const start = candidate.search(/[\[{]/);
  if (start === -1) throw new Error("Claude returned no JSON");
  // Walk to the matching close bracket.
  const open = candidate[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        return JSON.parse(candidate.slice(start, i + 1));
      }
    }
  }
  // The reply was cut off mid-JSON (the model ran out of output budget).
  // Rather than throwing away the whole session, close whatever is still open
  // and parse what we got — the stages all tolerate missing fields, so a
  // slightly short plan still beats a failed upload.
  try {
    const salvaged = JSON.parse(closeOpenJson(candidate.slice(start)));
    console.warn("  (recovered a truncated JSON reply)");
    return salvaged;
  } catch {
    throw new Error("Claude returned unbalanced JSON");
  }
}

// Append the closing quote/brackets a truncated JSON fragment is missing.
function closeOpenJson(fragment) {
  const stack = [];
  let inStr = false;
  let esc = false;
  for (const ch of fragment) {
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let out = fragment;
  if (inStr) out += '"'; // close a half-written string
  out = out.replace(/,\s*$/, ""); // drop a dangling comma
  while (stack.length) out += stack.pop() === "{" ? "}" : "]";
  return out;
}
