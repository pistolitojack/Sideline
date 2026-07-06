import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";

// Model pinned by SPEC.md.
export const MODEL = "claude-sonnet-4-6";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function askClaude({ system, content, maxTokens = 4000 }) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  });
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
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
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
  throw new Error("Claude returned unbalanced JSON");
}
