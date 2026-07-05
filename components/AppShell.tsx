"use client";

import { useEffect, useState } from "react";
import { ACCENTS, BASE } from "@/lib/design";
import type { Coach, Piece } from "@/lib/types";
import Business from "./Business";
import Review from "./Review";
import TabBar, { type Tab } from "./TabBar";
import Today from "./Today";

// The whole app is three tabs and a sheet. Phase 1 keeps piece state in
// memory (Demo Mode); later phases read and write Supabase instead.
export default function AppShell({
  coach,
  initialPieces,
  demo,
}: {
  coach: Coach;
  initialPieces: Piece[];
  demo: boolean;
}) {
  const [tab, setTab] = useState<Tab>("today");
  const [pieces, setPieces] = useState<Piece[]>(initialPieces);
  const [mission, setMission] = useState(coach.mission);

  const accent = coach.accentHex;
  const accentDeep =
    ACCENTS.find((a) => a.a.toLowerCase() === accent.toLowerCase())?.d ??
    "#7E0A1D";

  // Keep the CSS variables in sync so anything styled with var(--accent)
  // follows the coach's brand color (fully dynamic in Phase 2).
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-deep", accentDeep);
  }, [accent, accentDeep]);

  const decide = (
    id: number,
    status: "approved" | "skipped",
    reason?: string | null
  ) =>
    setPieces((ps) =>
      ps.map((p) => (p.id === id ? { ...p, status, skipReason: reason } : p))
    );

  const readyCount = pieces.filter((p) => p.status === "ready").length;

  return (
    <div
      className="mx-auto flex flex-col"
      style={{
        maxWidth: 430,
        height: "100dvh",
        background: BASE.paper,
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
          }}
        >
          Demo mode — sample coach &amp; content
        </div>
      )}
      {tab === "today" && (
        <Today
          coach={coach}
          accentDeep={accentDeep}
          pieces={pieces}
          mission={mission}
          setMission={setMission}
          goReview={() => setTab("review")}
          demo={demo}
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
