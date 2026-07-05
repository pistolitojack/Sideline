"use client";

import { BASE } from "@/lib/design";

// V1 Business tab per SPEC.md: a simple placeholder card + the mission line.
// No fake numbers in production — the real Sunday Report comes after launch.
export default function Business({
  mission,
  accent,
}: {
  mission: string;
  accent: string;
}) {
  return (
    <div
      className="flex-1 overflow-y-auto px-5 pt-4 pb-6"
      style={{ minHeight: 0 }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: BASE.muted,
          textTransform: "uppercase",
        }}
      >
        Sunday report
      </p>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: BASE.ink,
          letterSpacing: "-0.02em",
          marginTop: 2,
        }}
      >
        Your employee&apos;s week
      </h1>
      <div
        className="mt-4"
        style={{
          background: BASE.card,
          border: `1px solid ${BASE.faint}`,
          borderRadius: 20,
          padding: "26px 20px",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: accent,
            textTransform: "uppercase",
          }}
        >
          Mission: {mission}
        </p>
        <p
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: BASE.ink,
            marginTop: 12,
            lineHeight: 1.4,
          }}
        >
          Your Sunday Report arrives after your first week of posting.
        </p>
        <p
          style={{
            fontSize: 13.5,
            color: BASE.muted,
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          Reach, profile visits, and DMs about training — the proof your
          employee is earning its keep, every Sunday.
        </p>
      </div>
    </div>
  );
}
