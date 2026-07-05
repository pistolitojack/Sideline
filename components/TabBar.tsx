"use client";

import { BASE } from "@/lib/design";

export type Tab = "today" | "review" | "business";

export default function TabBar({
  tab,
  setTab,
  badge,
  accent,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  badge: number;
  accent: string;
}) {
  const items: { id: Tab; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "review", label: "Review" },
    { id: "business", label: "Business" },
  ];
  return (
    <div
      className="flex items-center justify-around"
      style={{
        borderTop: `1px solid ${BASE.faint}`,
        background: "rgba(255,255,255,0.92)",
        padding: "10px 0 calc(14px + env(safe-area-inset-bottom))",
      }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          className="relative"
          style={{
            fontSize: 13,
            fontWeight: tab === it.id ? 700 : 500,
            color: tab === it.id ? BASE.ink : BASE.muted,
            padding: "4px 14px",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          {it.label}
          {it.id === "review" && badge > 0 && (
            <span
              className="absolute"
              style={{
                top: -2,
                right: -2,
                minWidth: 16,
                height: 16,
                borderRadius: 999,
                background: accent,
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
              }}
            >
              {badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
