"use client";

import { useEffect, useState } from "react";
import { ACCENTS, BASE } from "@/lib/design";
import type { Coach, Piece } from "@/lib/types";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import Business from "./Business";
import Review, { type ReviewDecision } from "./Review";
import TabBar, { type Tab } from "./TabBar";
import Today from "./Today";

export type ActiveSession = { id: string; status: string } | null;

// The whole app is three tabs and a sheet. Demo Mode keeps piece state in
// memory; signed-in coaches persist their profile changes to Supabase.
export default function AppShell({
  coach,
  coachId,
  hasVoiceMemo = true,
  activeSession = null,
  initialPieces,
  demo,
}: {
  coach: Coach;
  coachId?: string;
  hasVoiceMemo?: boolean;
  activeSession?: ActiveSession;
  initialPieces: Piece[];
  demo: boolean;
}) {
  const [tab, setTab] = useState<Tab>("today");
  const [pieces, setPieces] = useState<Piece[]>(initialPieces);
  const [mission, setMissionState] = useState(coach.mission);

  const setMission = (m: string) => {
    setMissionState(m);
    // Persist for real coaches — the mission re-aims all future writing.
    if (!demo && coachId && hasSupabaseEnv()) {
      createClient()
        .from("coaches")
        .update({ mission: m })
        .eq("id", coachId)
        .then(undefined, () => {});
    }
  };

  const accent = coach.accentHex;
  const accentDeep =
    ACCENTS.find((a) => a.a.toLowerCase() === accent.toLowerCase())?.d ??
    "#7E0A1D";

  // Keep the CSS variables in sync so anything styled with var(--accent)
  // follows the coach's brand color.
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-deep", accentDeep);
  }, [accent, accentDeep]);

  const decide = (
    id: number | string,
    status: "approved" | "skipped",
    detail?: ReviewDecision
  ) => {
    const reason = detail?.reason ?? null;
    setPieces((ps) =>
      ps.map((p) => (p.id === id ? { ...p, status, skipReason: reason } : p))
    );
    // Real pieces (uuid ids) persist; every approve/skip trains the employee.
    if (!demo && typeof id === "string" && hasSupabaseEnv()) {
      const db = createClient();
      db.from("content_pieces")
        .update({
          status,
          skip_reason: reason,
          skip_reason_text: detail?.reasonText ?? null,
          // Phase 3.5 — silent behaviour signal. Never shown to the coach.
          reviewed_at: new Date().toISOString(),
          review_dwell_ms: detail?.dwellMs ?? null,
          detail_opened: detail?.detailOpened ?? false,
        })
        .eq("id", id)
        .then(({ error }) => {
          // If a migration hasn't been run the column is missing and the whole
          // update fails — which would lose the decision itself. The decision
          // matters more than the telemetry, so fall back to just the decision.
          if (error) {
            db.from("content_pieces")
              .update({ status, skip_reason: reason })
              .eq("id", id)
              .then(undefined, () => {});
          }
        }, () => {});

      // Phase 3.7 — when the LAST piece in a session gets a decision, the
      // session is fully reviewed and there is something to learn from. Queue
      // the reflection. Computed from the list we just updated rather than a
      // fresh query, so it reflects this decision.
      const piece = pieces.find((p) => p.id === id);
      const sessionId = piece?.sessionId;
      if (sessionId) {
        const settled = (p: Piece) =>
          p.id === id ||
          ["approved", "downloaded", "skipped"].includes(p.status);
        const siblings = pieces.filter((p) => p.sessionId === sessionId);
        if (siblings.length && siblings.every(settled)) {
          db.from("jobs")
            .insert({ session_id: sessionId, stage: "reflect", status: "pending" })
            .then(undefined, () => {});
        }
      }
    }
  };

  const markDownloaded = (id: number | string) => {
    setPieces((ps) =>
      ps.map((p) => (p.id === id ? { ...p, status: "downloaded" } : p))
    );
    if (!demo && typeof id === "string" && hasSupabaseEnv()) {
      createClient()
        .from("content_pieces")
        .update({ status: "downloaded" })
        .eq("id", id)
        .then(undefined, () => {});
    }
  };

  const requestRevision = (piece: Piece, note: string) => {
    setPieces((ps) => ps.filter((p) => p.id !== piece.id));
    if (
      !demo &&
      typeof piece.id === "string" &&
      piece.sessionId &&
      hasSupabaseEnv()
    ) {
      const c = createClient();
      // Phase 3.5 — how many times this piece had to be sent back is one of
      // the sharpest quality signals we have: the coach kept the idea but the
      // execution missed. Counted in the database so concurrent updates can't
      // clobber each other.
      c.rpc("bump_revision_count", { piece_id: piece.id }).then(
        undefined,
        () => {}
      );
      // Record the ASK the moment it is made, not when the worker finishes.
      // What the coach asked for is true whether or not the re-cut succeeds —
      // and a revision killed mid-flight used to erase the single most useful
      // signal in the system. The worker appends the same note again if it
      // completes, so the history de-duplicates on note+minute below.
      const askedAt = new Date().toISOString();
      const priorHistory = Array.isArray(piece.revisions) ? piece.revisions : [];
      c.from("content_pieces")
        .update({
          revision_note: note.slice(0, 600),
          status: "rendering",
          revision_history: [
            ...priorHistory,
            { note: note.slice(0, 600), at: askedAt },
          ].slice(-12),
        })
        .eq("id", piece.id)
        .then(() =>
          c
            .from("jobs")
            .insert({
              session_id: piece.sessionId,
              stage: "revise",
              status: "pending",
            })
        )
        .then(undefined, () => {});
    }
  };

  const removePiece = (id: number | string) => {
    setPieces((ps) => ps.filter((p) => p.id !== id));
    if (!demo && typeof id === "string" && hasSupabaseEnv()) {
      createClient()
        .from("content_pieces")
        .delete()
        .eq("id", id)
        .then(undefined, () => {});
    }
  };

  const readyCount = pieces.filter((p) => p.status === "ready").length;

  return (
    <div
      className="mx-auto flex flex-col"
      style={{
        maxWidth: 430,
        height: "100dvh",
      }}
    >
      {demo && (
        <div
          className="flex items-center justify-center"
          style={{
            background: BASE.ink,
            color: "rgba(255,255,255,0.85)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "6px 0",
            borderRadius: "0 0 14px 14px",
          }}
        >
          Demo mode — sample coach &amp; content
        </div>
      )}
      {tab === "today" && (
        <Today
          coach={coach}
          coachId={coachId}
          accentDeep={accentDeep}
          pieces={pieces}
          mission={mission}
          setMission={setMission}
          goReview={() => setTab("review")}
          demo={demo}
          hasVoiceMemo={hasVoiceMemo}
          initialActiveSession={activeSession}
          onDownloaded={markDownloaded}
          onDelete={removePiece}
          onRevise={requestRevision}
        />
      )}
      {tab === "review" && (
        <Review
          pieces={pieces}
          onDecision={decide}
          goToday={() => setTab("today")}
          accent={accent}
          onRevise={requestRevision}
        />
      )}
      {tab === "business" && <Business mission={mission} accent={accent} />}
      <TabBar tab={tab} setTab={setTab} badge={readyCount} accent={accent} />
    </div>
  );
}
