"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// The founder's calibration signal on one piece. Four 1-5 sliders and a note.
// Saved straight to content_pieces — the admin update policy from
// v9-founder-ratings.sql is what permits the write.
//
// These ratings are internal. They are never shown to the coach, and per the
// Phase 3 plan they are NOT fed to the AI yet — item 6 injects coach history,
// deliberately not this.

type Ratings = {
  hook_rating: number | null;
  pacing_rating: number | null;
  copy_rating: number | null;
  would_post_rating: number | null;
  founder_notes: string;
};

const SLIDERS: { key: keyof Ratings; label: string; hint: string }[] = [
  { key: "hook_rating", label: "Hook", hint: "does the hook work?" },
  { key: "pacing_rating", label: "Pacing", hint: "does the cut feel right?" },
  { key: "copy_rating", label: "Copy", hint: "does it match the footage?" },
  { key: "would_post_rating", label: "Would post", hint: "would you post it?" },
];

export default function RatingWidget({
  pieceId,
  initial,
}: {
  pieceId: string;
  initial: Ratings;
}) {
  const [v, setV] = useState<Ratings>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  const set = <K extends keyof Ratings>(key: K, value: Ratings[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setState("idle");
  };

  const save = async () => {
    setState("saving");
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase
      .from("content_pieces")
      .update({
        hook_rating: v.hook_rating,
        pacing_rating: v.pacing_rating,
        copy_rating: v.copy_rating,
        would_post_rating: v.would_post_rating,
        founder_notes: v.founder_notes.trim() || null,
        rated_at: new Date().toISOString(),
      })
      .eq("id", pieceId);
    if (err) {
      setState("error");
      setError(err.message);
      return;
    }
    setState("saved");
  };

  const rated = SLIDERS.filter((s) => v[s.key] != null).length;

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Your rating
        </span>
        <span className="text-xs text-neutral-400">{rated}/4 set</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SLIDERS.map(({ key, label, hint }) => {
          const value = v[key] as number | null;
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-medium" htmlFor={`${key}-${pieceId}`}>
                  {label}{" "}
                  <span className="font-normal text-neutral-400">{hint}</span>
                </label>
                <span className="text-sm tabular-nums text-neutral-500">
                  {value ?? "—"}
                </span>
              </div>
              <div className="mt-1 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={value === n}
                    onClick={() => set(key, (value === n ? null : n) as never)}
                    className={`h-9 flex-1 rounded-md border text-sm transition ${
                      value === n
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <label className="mt-3 block">
        <span className="sr-only">Notes on this piece</span>
        <textarea
          value={v.founder_notes}
          onChange={(e) => set("founder_notes", e.target.value)}
          rows={2}
          placeholder="Notes on this piece (optional)"
          className="w-full resize-y rounded-md border border-neutral-300 bg-white p-2 text-sm"
        />
      </label>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={state === "saving"}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {state === "saving" ? "Saving…" : "Save rating"}
        </button>
        {state === "saved" && (
          <span className="text-sm text-emerald-700">Saved</span>
        )}
        {state === "error" && (
          <span className="text-sm text-red-700">{error}</span>
        )}
      </div>
    </div>
  );
}
