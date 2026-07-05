"use client";

import { BASE } from "@/lib/design";

export type Tab = "today" | "review" | "business";

// Floating glass pill — the only chrome in the app.
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
      style={{
        padding: "8px 18px calc(12px + env(safe-area-inset-bottom))",
        flexShrink: 0,
      }}
    >
      <div
        className="flex items-center"
        style={{
          borderRadius: 999,
          background: "rgba(255,255,255,0.78)",
          backdropFilter: "blur(20px) saturate(1.5)",
          WebkitBackdropFilter: "blur(20px) saturate(1.5)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow:
            "0 20px 45px -18px rgba(26,25,21,0.4), 0 2px 8px -4px rgba(26,25,21,0.15)",
          padding: 5,
          gap: 4,
        }}
      >
        {items.map((it) => {
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className="relative flex-1"
              style={{
                fontSize: 13,
                fontWeight: active ? 700 : 600,
                color: active ? "#fff" : BASE.muted,
                background: active ? BASE.ink : "transparent",
                padding: "11px 0",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                transition: "background 0.25s, color 0.25s",
              }}
            >
              {it.label}
              {it.id === "review" && badge > 0 && (
                <span
                  className="absolute"
                  style={{
                    top: 4,
                    right: "18%",
                    minWidth: 17,
                    height: 17,
                    borderRadius: 999,
                    background: accent,
                    color: "#fff",
                    fontSize: 9.5,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    boxShadow: "0 4px 10px -3px rgba(0,0,0,0.4)",
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
