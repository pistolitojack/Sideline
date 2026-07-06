"use client";

import { useEffect, useState } from "react";
import { ACCENTS, BASE } from "@/lib/design";
import type { Coach, Piece } from "@/lib/types";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import Business from "./Business";
import Review from "./Review";
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
    reason?: string | null
  ) => {
    setPieces((ps) =>
      ps.map((p) => (p.id === id ? { ...p, status, skipReason: reason } : p))
    );
    // Real pieces (uuid ids) persist; every approve/skip trains the employee.
    if (!demo && typeof id === "string" && hasSupabaseEnv()) {
      createClient()
        .from("content_pieces")
        .update({ status, skip_reason: reason ?? null })
        .eq("id", id)
        .then(undefined, () => {});
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
        />
      )}
      {tab === "review" && (
        <Review
          pieces={pieces}
          onDecision={decide}
          goToday={() => setTab("today")}
          accent={accent}
        />
      )}
      {tab === "business" && <Business mission={mission} accent={accent} />}
      <TabBar tab={tab} setTab={setTab} badge={readyCount} accent={accent} />
    </div>
  );
}
