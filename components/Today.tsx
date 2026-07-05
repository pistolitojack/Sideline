"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BASE } from "@/lib/design";
import type { Coach, Piece } from "@/lib/types";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import type { ActiveSession } from "./AppShell";
import DayStrip from "./DayStrip";
import Footage from "./Footage";
import VoiceMemoSheet from "./VoiceMemoSheet";

const MISSIONS = [
  "More private clients",
  "Fill the fall program",
  "Build the brand",
  "Sell online coaching",
];

const SESSION_LABEL: Record<string, string> = {
  uploading: "Upload in progress…",
  queued: "In line — cutting starts soon",
  processing: "Cutting your session now",
};

export default function Today({
  coach,
  coachId,
  accentDeep,
  pieces,
  mission,
  setMission,
  goReview,
  demo,
  hasVoiceMemo,
  initialActiveSession,
}: {
  coach: Coach;
  coachId?: string;
  accentDeep: string;
  pieces: Piece[];
  mission: string;
  setMission: (m: string) => void;
  goReview: () => void;
  demo: boolean;
  hasVoiceMemo: boolean;
  initialActiveSession: ActiveSession;
}) {
  const router = useRouter();
  const [mSheet, setMSheet] = useState(false);
  const [voiceSheet, setVoiceSheet] = useState(false);
  const [voiceDone, setVoiceDone] = useState(hasVoiceMemo);
  const [uploadNote, setUploadNote] = useState(false);
  const [activeSession, setActiveSession] = useState(initialActiveSession);

  const accent = coach.accentHex;
  const ready = pieces.filter((p) => p.status === "ready").length;
  const approved = pieces.filter(
    (p) => p.status === "approved" || p.status === "downloaded"
  );
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

  // Follow the active session while it moves through the pipeline.
  useEffect(() => {
    if (!activeSession || demo || !hasSupabaseEnv()) return;
    const t = setInterval(async () => {
      const { data } = await createClient()
        .from("sessions")
        .select("id, status")
        .eq("id", activeSession.id)
        .maybeSingle();
      if (!data || data.status === "ready" || data.status === "failed") {
        setActiveSession(null);
      } else {
        setActiveSession(data);
      }
    }, 8000);
    return () => clearInterval(t);
  }, [activeSession, demo]);

  const onUpload = () => {
    if (demo) {
      setUploadNote(true);
      setTimeout(() => setUploadNote(false), 2600);
      return;
    }
    router.push("/upload");
  };

  return (
    <div
      className="flex-1 flex flex-col px-5 pt-5 pb-4 overflow-y-auto"
      style={{ minHeight: 0 }}
    >
      <p
        style={{
          fontSize: 11.5,
          color: BASE.muted,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {today}
      </p>
      <h1
        style={{
          fontSize: 30,
          fontWeight: 800,
          color: BASE.ink,
          letterSpacing: "-0.03em",
          marginTop: 2,
        }}
      >
        {coach.name}
      </h1>

      <button
        onClick={onUpload}
        className="w-full mt-4 sl-card-press"
        style={{
          border: "none",
          cursor: "pointer",
          borderRadius: 28,
          padding: 0,
          background: `linear-gradient(155deg, ${accent} 0%, ${accentDeep} 78%, #0E0C0A 140%)`,
          boxShadow: `0 24px 50px -20px ${accent}99, inset 0 1px 0 rgba(255,255,255,0.25)`,
          minHeight: 235,
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
            top: -70,
            right: -70,
            width: 240,
            height: 240,
            borderRadius: 999,
            background:
              "radial-gradient(circle, rgba(255,255,255,0.22), rgba(255,255,255,0.04) 70%)",
          }}
        />
        <div className="absolute inset-0 sl-sheen" />
        <div style={{ padding: "0 22px 8px", position: "relative" }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              background: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(255,255,255,0.28)",
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
              fontSize: 25,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.02em",
              display: "block",
              lineHeight: 1.12,
              textShadow: "0 2px 12px rgba(0,0,0,0.18)",
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
            color: "rgba(255,255,255,0.8)",
            padding: "6px 22px 22px",
            position: "relative",
          }}
        >
          Raw footage in. Finished week out.
        </span>
      </button>

      {activeSession && (
        <div
          className="w-full mt-3 flex items-center sl-rise"
          style={{
            border: `1px solid ${BASE.faint}`,
            background: BASE.card,
            borderRadius: 18,
            padding: "13px 16px",
            gap: 10,
            boxShadow: "0 12px 30px -22px rgba(26,25,21,0.4)",
          }}
        >
          <span
            className="sl-pulse"
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: accent,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: BASE.ink }}>
            {SESSION_LABEL[activeSession.status] ?? "Working…"}
          </span>
          <span
            style={{
              fontSize: 11.5,
              color: BASE.muted,
              marginLeft: "auto",
              fontWeight: 600,
            }}
          >
            we&apos;ll notify you
          </span>
        </div>
      )}

      <button
        onClick={() => setMSheet(true)}
        className="w-full mt-3 flex items-center sl-card-press"
        style={{
          border: `1px solid ${BASE.faint}`,
          background: BASE.card,
          borderRadius: 18,
          padding: "13px 16px",
          cursor: "pointer",
          gap: 8,
          boxShadow: "0 12px 30px -22px rgba(26,25,21,0.4)",
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

      {!voiceDone && !demo && coachId && (
        <button
          onClick={() => setVoiceSheet(true)}
          className="w-full mt-3 flex items-center sl-card-press"
          style={{
            border: "none",
            background: `linear-gradient(150deg, #1C1A16, #2E2B24)`,
            borderRadius: 18,
            padding: "14px 16px",
            cursor: "pointer",
            gap: 12,
            textAlign: "left",
            boxShadow: "0 16px 36px -20px rgba(26,25,21,0.65)",
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            ●
          </span>
          <span>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: "#fff",
                display: "block",
              }}
            >
              Teach it your voice
            </span>
            <span
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.6)",
                display: "block",
                marginTop: 2,
              }}
            >
              60 seconds, once — your captions will sound like you
            </span>
          </span>
          <span
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.6)",
              marginLeft: "auto",
              fontWeight: 700,
            }}
          >
            →
          </span>
        </button>
      )}

      {ready > 0 && (
        <button
          onClick={goReview}
          className="w-full mt-3 flex items-center justify-between sl-card-press"
          style={{
            border: `1px solid ${BASE.faint}`,
            background: BASE.card,
            borderRadius: 18,
            padding: "15px 16px",
            cursor: "pointer",
            boxShadow: "0 12px 30px -22px rgba(26,25,21,0.4)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: BASE.ink }}>
            {ready} piece{ready === 1 ? "" : "s"} ready to review
          </span>
          <span style={{ color: accent, fontWeight: 700, fontSize: 14 }}>→</span>
        </button>
      )}

      <div className="mt-6">
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
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
                    borderRadius: 14,
                    overflow: "hidden",
                    boxShadow: "0 10px 24px -10px rgba(0,0,0,0.4)",
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
            Demo mode — 5 sample pieces are waiting in Review
          </span>
        </div>
      )}

      {voiceSheet && coachId && (
        <VoiceMemoSheet
          coachId={coachId}
          accent={accent}
          onClose={() => setVoiceSheet(false)}
          onSaved={() => setVoiceDone(true)}
        />
      )}

      {mSheet && (
        <div
          className="fixed inset-0 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.4)", zIndex: 40 }}
          onClick={() => setMSheet(false)}
        >
          <div
            className="sl-rise"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(255,255,255,0.94)",
              backdropFilter: "blur(18px)",
              borderRadius: "24px 24px 0 0",
              padding: "20px 20px calc(30px + env(safe-area-inset-bottom))",
              maxWidth: 430,
              margin: "0 auto",
              width: "100%",
            }}
          >
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 4,
                background: BASE.faint,
                margin: "0 auto 14px",
              }}
            />
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
