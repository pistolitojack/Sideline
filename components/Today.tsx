"use client";

import { useState } from "react";
import { BASE } from "@/lib/design";
import type { Coach, Piece } from "@/lib/types";
import DayStrip from "./DayStrip";
import Footage from "./Footage";

const MISSIONS = [
  "More private clients",
  "Fill the fall program",
  "Build the brand",
  "Sell online coaching",
];

export default function Today({
  coach,
  accentDeep,
  pieces,
  mission,
  setMission,
  goReview,
  demo,
}: {
  coach: Coach;
  accentDeep: string;
  pieces: Piece[];
  mission: string;
  setMission: (m: string) => void;
  goReview: () => void;
  demo: boolean;
}) {
  const [mSheet, setMSheet] = useState(false);
  const [uploadNote, setUploadNote] = useState(false);
  const accent = coach.accentHex;
  const ready = pieces.filter((p) => p.status === "ready").length;
  const approved = pieces.filter(
    (p) => p.status === "approved" || p.status === "downloaded"
  );
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const onUpload = () => {
    // Real uploads arrive in Phase 3 — for now say so in plain English.
    setUploadNote(true);
    setTimeout(() => setUploadNote(false), 2600);
  };

  return (
    <div
      className="flex-1 flex flex-col px-5 pt-4 pb-4 overflow-y-auto"
      style={{ minHeight: 0 }}
    >
      <p style={{ fontSize: 13, color: BASE.muted, fontWeight: 600 }}>{today}</p>
      <h1
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: BASE.ink,
          letterSpacing: "-0.02em",
          marginTop: 2,
        }}
      >
        {coach.name}
      </h1>

      <button
        onClick={onUpload}
        className="w-full mt-4"
        style={{
          border: "none",
          cursor: "pointer",
          borderRadius: 24,
          padding: 0,
          background: `linear-gradient(150deg, ${accent}, ${accentDeep})`,
          boxShadow: `0 18px 40px -18px ${accent}90`,
          minHeight: 225,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          position: "relative",
          overflow: "hidden",
          textAlign: "left",
        }}
      >
        <div
          className="absolute sl-pulse"
          style={{
            top: -60,
            right: -60,
            width: 220,
            height: 220,
            borderRadius: 999,
            background: "rgba(255,255,255,0.10)",
          }}
        />
        <div style={{ padding: "0 22px 8px" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <span style={{ color: "#fff", fontSize: 22, fontWeight: 300 }}>↑</span>
          </div>
          <span
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.02em",
              display: "block",
              lineHeight: 1.15,
            }}
          >
            Upload today&apos;s
            <br />
            training
          </span>
        </div>
        <span
          style={{
            fontSize: 12.5,
            color: "rgba(255,255,255,0.75)",
            padding: "6px 22px 22px",
          }}
        >
          Raw footage in. Finished week out.
        </span>
      </button>

      <button
        onClick={() => setMSheet(true)}
        className="w-full mt-3 flex items-center"
        style={{
          border: `1px solid ${BASE.faint}`,
          background: BASE.card,
          borderRadius: 16,
          padding: "12px 16px",
          cursor: "pointer",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: accent,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: BASE.ink }}>
          Mission: <span style={{ fontWeight: 600 }}>{mission}</span>
        </span>
        <span
          style={{
            fontSize: 12,
            color: BASE.muted,
            marginLeft: "auto",
            fontWeight: 600,
          }}
        >
          change
        </span>
      </button>

      {ready > 0 && (
        <button
          onClick={goReview}
          className="w-full mt-3 flex items-center justify-between"
          style={{
            border: `1px solid ${BASE.faint}`,
            background: BASE.card,
            borderRadius: 16,
            padding: "14px 16px",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: BASE.ink }}>
            {ready} piece{ready === 1 ? "" : "s"} ready to review
          </span>
          <span style={{ color: accent, fontWeight: 700, fontSize: 14 }}>→</span>
        </button>
      )}

      <div className="mt-5">
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: BASE.muted,
            textTransform: "uppercase",
          }}
        >
          This week
        </p>
        {approved.length === 0 ? (
          <p style={{ fontSize: 13, color: BASE.muted, marginTop: 8 }}>
            Nothing scheduled yet — review your pieces and your week fills
            itself.
          </p>
        ) : (
          <div className="flex mt-3" style={{ gap: 10, overflowX: "auto" }}>
            {approved.map((p) => (
              <div key={p.id} style={{ flexShrink: 0, width: 84 }}>
                <div
                  style={{
                    width: 84,
                    height: 149,
                    borderRadius: 12,
                    overflow: "hidden",
                    boxShadow: "0 8px 20px -10px rgba(0,0,0,0.35)",
                  }}
                >
                  <Footage piece={p} small playing={false} />
                </div>
                <p
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: BASE.muted,
                    marginTop: 5,
                    textAlign: "center",
                  }}
                >
                  {p.slot}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 px-1">
          <DayStrip pieces={pieces} accent={accent} />
        </div>
      </div>

      {uploadNote && (
        <div
          className="fixed inset-x-0 flex justify-center sl-rise"
          style={{ top: 16, zIndex: 50 }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: "#fff",
              background: BASE.ink,
              borderRadius: 999,
              padding: "9px 18px",
              boxShadow: "0 12px 30px -12px rgba(0,0,0,0.5)",
            }}
          >
            {demo
              ? "Uploads arrive in Phase 3 — 5 demo pieces are waiting in Review"
              : "Uploads arrive in Phase 3 — hang tight"}
          </span>
        </div>
      )}

      {mSheet && (
        <div
          className="fixed inset-0 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.35)", zIndex: 40 }}
          onClick={() => setMSheet(false)}
        >
          <div
            className="sl-rise"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: BASE.card,
              borderRadius: "22px 22px 0 0",
              padding: "20px 20px 30px",
              maxWidth: 430,
              margin: "0 auto",
              width: "100%",
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 700, color: BASE.ink }}>
              Change the mission
            </p>
            <p style={{ fontSize: 12.5, color: BASE.muted, marginTop: 3 }}>
              Every hook and call-to-action re-aims instantly.
            </p>
            <div className="flex flex-col mt-4" style={{ gap: 8 }}>
              {MISSIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMission(m);
                    setMSheet(false);
                  }}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: mission === m ? "#fff" : BASE.ink,
                    background: mission === m ? accent : BASE.paper,
                    border: `1px solid ${mission === m ? accent : BASE.faint}`,
                    borderRadius: 14,
                    padding: "13px 16px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
