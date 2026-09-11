// Phase 3.6 — coach memory.
//
// Until now the director met every coach for the first time, every session. It
// had their profile but no idea what they had ever said yes or no to. This
// loads what the coach has actually done — approved, skipped and why, sent
// back for changes, which starting points they reach for, how long they look
// before deciding — and hands it to the director as OBSERVATION, not as
// instruction. The AI decides what to do with it.
//
// Two rules this module exists to keep:
//   1. A coach with no history gets NO section at all, not an empty scaffold.
//      An empty table would read as "this coach likes nothing".
//   2. Founder ratings are deliberately absent. Those are our internal
//      calibration signal, not the coach's behaviour.
//
// Loading and formatting are separate on purpose: `formatCoachMemory` is pure,
// so the wording can be tested exhaustively without a database.

const APPROVED = new Set(["approved", "downloaded"]);

// Read the coach's recent history. Returns a plain data object — no prose.
export async function loadCoachHistory(db, coachId) {
  const { data: sessions } = await db
    .from("sessions")
    .select("id, prompt_chip, prompt_source, prompt_length, created_at")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false })
    .limit(50);

  const ids = (sessions ?? []).map((s) => s.id);
  if (!ids.length) return null;

  const { data: pieces } = await db
    .from("content_pieces")
    .select(
      "hook, piece_kind, director_intent, status, skip_reason, skip_reason_text, revision_history, review_dwell_ms, detail_opened, reviewed_at"
    )
    .in("session_id", ids)
    .order("created_at", { ascending: false })
    .limit(200);

  return {
    // Chip stats come from the most recent 20 sessions only — how a coach asks
    // for work drifts, and old habits shouldn't outvote current ones.
    sessions: (sessions ?? []).slice(0, 20),
    pieces: pieces ?? [],
  };
}

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const shorten = (s, n) => String(s ?? "").trim().slice(0, n);

// Turn the history into the plain-text section the director reads.
// Returns "" when there is nothing worth saying.
export function formatCoachMemory(history) {
  if (!history) return "";
  const pieces = Array.isArray(history.pieces) ? history.pieces : [];
  const sessions = Array.isArray(history.sessions) ? history.sessions : [];

  const approved = pieces.filter((p) => APPROVED.has(p.status));
  const skipped = pieces.filter((p) => p.status === "skipped");
  const decided = approved.length + skipped.length;

  // Nothing decided yet means nothing learned yet. Say nothing.
  if (!decided) return "";

  const lines = [
    "WHAT THIS COACH RESPONDS TO",
    "This is their real history with you. It is here so you can serve them",
    "better — read it, weigh it, and decide for yourself what it means. It is",
    "not a set of rules, and their request for THIS upload still comes first.",
    "",
  ];

  // ——— approval rate by kind ———
  const byKind = new Map();
  for (const p of [...approved, ...skipped]) {
    const k = p.piece_kind || "unknown";
    const e = byKind.get(k) ?? { yes: 0, total: 0 };
    e.total += 1;
    if (APPROVED.has(p.status)) e.yes += 1;
    byKind.set(k, e);
  }
  const kindRows = [...byKind.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(
      ([k, e]) => `  - ${k}: kept ${e.yes} of ${e.total} (${pct(e.yes, e.total)}%)`
    );
  if (kindRows.length) {
    lines.push(
      `They have decided on ${decided} piece${decided === 1 ? "" : "s"}. By kind:`,
      ...kindRows,
      ""
    );
  }

  // ——— what they kept ———
  if (approved.length) {
    lines.push("PIECES THEY KEPT (most recent first):");
    for (const p of approved.slice(0, 20)) {
      lines.push(
        `  - [${p.piece_kind || "?"}] "${shorten(p.hook, 90)}"` +
          (p.director_intent ? ` — made because: ${shorten(p.director_intent, 110)}` : "")
      );
    }
    lines.push("");
  }

  // ——— what they rejected, and in their own words ———
  if (skipped.length) {
    lines.push("PIECES THEY REJECTED (most recent first):");
    for (const p of skipped.slice(0, 20)) {
      const why = [
        p.skip_reason ? `reason: ${p.skip_reason}` : null,
        p.skip_reason_text ? `they said: "${shorten(p.skip_reason_text, 140)}"` : null,
      ]
        .filter(Boolean)
        .join("; ");
      lines.push(
        `  - [${p.piece_kind || "?"}] "${shorten(p.hook, 90)}"` +
          (why ? ` — ${why}` : " — no reason given")
      );
    }
    lines.push("");
  }

  // ——— changes they asked for: the sharpest signal there is ———
  const revisions = [];
  for (const p of pieces) {
    for (const r of Array.isArray(p.revision_history) ? p.revision_history : []) {
      if (r?.note) revisions.push({ hook: p.hook, note: r.note });
    }
  }
  if (revisions.length) {
    lines.push(
      "CHANGES THEY ASKED FOR — they wanted the piece, but not as you made it.",
      "This is the most direct correction you get:"
    );
    for (const r of revisions.slice(0, 10)) {
      lines.push(`  - on "${shorten(r.hook, 70)}" they asked: "${shorten(r.note, 160)}"`);
    }
    lines.push("");
  }

  // ——— how they ask for work ———
  const withChip = sessions.filter((s) => s.prompt_chip);
  if (sessions.length) {
    const chipCounts = new Map();
    for (const s of withChip)
      chipCounts.set(s.prompt_chip, (chipCounts.get(s.prompt_chip) ?? 0) + 1);
    const srcCounts = new Map();
    for (const s of sessions)
      if (s.prompt_source)
        srcCounts.set(s.prompt_source, (srcCounts.get(s.prompt_source) ?? 0) + 1);
    const lengths = sessions
      .map((s) => Number(s.prompt_length))
      .filter((n) => Number.isFinite(n) && n > 0);

    const bits = [];
    if (chipCounts.size)
      bits.push(
        "  - starting points they pick: " +
          [...chipCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([c, n]) => `${c} (${n}x)`)
            .join(", ")
      );
    if (srcCounts.size)
      bits.push(
        "  - how they send it: " +
          [...srcCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([s, n]) => `${s} ${pct(n, sessions.length)}%`)
            .join(", ")
      );
    if (lengths.length)
      bits.push(
        `  - typical request length: ${Math.round(
          lengths.reduce((a, b) => a + b, 0) / lengths.length
        )} characters`
      );
    if (bits.length) {
      lines.push(`HOW THEY ASK (last ${sessions.length} sessions):`, ...bits, "");
    }
  }

  // ——— how they review ———
  const avg = (rows) => {
    const ns = rows
      .map((p) => Number(p.review_dwell_ms))
      .filter((n) => Number.isFinite(n) && n > 0);
    return ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length / 100) / 10 : null;
  };
  const aDwell = avg(approved);
  const sDwell = avg(skipped);
  const opened = pieces.filter((p) => p.detail_opened).length;
  const reviewed = pieces.filter((p) => p.reviewed_at).length;
  const behaviour = [];
  if (aDwell != null) behaviour.push(`  - average ${aDwell}s before keeping a piece`);
  if (sDwell != null) behaviour.push(`  - average ${sDwell}s before rejecting one`);
  if (reviewed)
    behaviour.push(
      `  - opened the detail view on ${pct(opened, reviewed)}% of pieces before deciding`
    );
  if (behaviour.length) lines.push("HOW THEY REVIEW:", ...behaviour, "");

  return lines.join("\n").trimEnd();
}

// Convenience: load and format in one call. Returns "" for a coach with no
// usable history, which is the signal to omit the section entirely.
export async function coachMemory(db, coachId) {
  try {
    return formatCoachMemory(await loadCoachHistory(db, coachId));
  } catch (e) {
    // Memory is an enhancement. A coach must still get their reels if the
    // history query fails for any reason.
    console.warn(`  coach memory unavailable: ${e.message}`);
    return "";
  }
}
