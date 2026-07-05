"use client";

import { BASE } from "@/lib/design";
import type { Piece } from "@/lib/types";

export default function DayStrip({
  pieces,
  accent,
}: {
  pieces: Piece[];
  accent: string;
}) {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="flex items-center justify-between" style={{ gap: 6 }}>
      {days.map((d, i) => {
        const filled = pieces.some(
          (p) =>
            (p.status === "approved" || p.status === "downloaded") &&
            p.day === i
        );
        return (
          <div key={i} className="flex flex-col items-center" style={{ gap: 5 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: filled ? accent : BASE.faint,
                transition: "background 0.4s, transform 0.4s",
                transform: filled ? "scale(1.15)" : "scale(1)",
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: filled ? BASE.ink : BASE.muted,
              }}
            >
              {d}
            </span>
          </div>
        );
      })}
    </div>
  );
}
