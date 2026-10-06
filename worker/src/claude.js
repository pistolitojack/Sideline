import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";

// Model pinned by SPEC.md.
export const MODEL = "claude-sonnet-4-6";

// WHY THESE ARE SET EXPLICITLY
//
// They were not, so the SDK's defaults applied: a 10-minute timeout with 2
// automatic retries. A request that never answers therefore blocks the worker
// for up to 30 minutes — and because the worker is a single loop, that is not
// one slow session, it is the whole pipeline stopped for every coach. The first
// outside user hit exactly this: 17 minutes of total silence on `understand`,
// job stuck in `running`, nothing in the logs, no error, no recovery.
//
// Real calls in production run 2-20 seconds. Three minutes is far beyond any
// legitimate response, including the image-heavy director call, so a request
// still running at that point is hung rather than slow. Worst case is now about
// nine minutes across all retries instead of thirty, and it ends in a thrown
// error the job runner can actually see and retry.
const REQUEST_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 180_000);
const MAX_RETRIES = Number(process.env.CLAUDE_MAX_RETRIES || 2);

// A call slower than this is worth noticing before it becomes a hang.
const SLOW_CALL_MS = 45_000;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: REQUEST_TIMEOUT_MS,
  maxRetries: MAX_RETRIES,
});

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

  const startedAt = Date.now();
  let res;
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: sys,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    // Say how long we waited. A timeout and a rejected key look identical in a
    // bare error message, and the difference decides what to go and fix.
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    throw new Error(`${label} failed after ${secs}s: ${err.message}`);
  }

  const elapsedMs = Date.now() - startedAt;
  const u = res.usage ?? {};
  const write = u.cache_creation_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  console.log(
    `  [tokens] ${label}: in=${u.input_tokens ?? 0} cache_write=${write} ` +
      `cache_read=${read} out=${u.output_tokens ?? 0}` +
      `  ${(elapsedMs / 1000).toFixed(1)}s` +
      (read > 0 ? "  <- cache HIT" : "")
  );
  if (elapsedMs > SLOW_CALL_MS) {
    console.warn(
      `  SLOW: ${label} took ${(elapsedMs / 1000).toFixed(1)}s ` +
        `(timeout is ${REQUEST_TIMEOUT_MS / 1000}s)`,
    );
  }

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

// Close the quote/brackets a truncated JSON fragment is missing, and drop any
// half-written trailing token (a dangling comma, a colon with no value, or a
// key whose value never arrived).
function balanceJson(fragment) {
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
  if (inStr) out += '"';
  out = out
    .replace(/[,:]\s*$/, "") // dangling comma or colon
    .replace(/,?\s*"[^"]*"\s*:\s*$/, ""); // key with no value
  while (stack.length) out += stack.pop() === "{" ? "}" : "]";
  return out;
}

// Truncation can land anywhere — mid-number, mid-key, inside a nested object.
// Walk back comma by comma until a version parses, so we keep as much of the
// reply as is actually valid instead of losing the whole piece.
function closeOpenJson(fragment) {
  let cut = fragment.length;
  for (let i = 0; i < 40 && cut > 0; i++) {
    const attempt = balanceJson(fragment.slice(0, cut));
    try {
      JSON.parse(attempt);
      return attempt;
    } catch {
      /* try an earlier boundary */
    }
    const prev = fragment.lastIndexOf(",", cut - 1);
    if (prev <= 0) break;
    cut = prev;
  }
  return balanceJson(fragment);
}
