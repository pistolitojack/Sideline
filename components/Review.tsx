"use client";

import { useRef, useState } from "react";
import { BASE, TYPE_COLORS } from "@/lib/design";
import type { Piece } from "@/lib/types";
import DayStrip from "./DayStrip";
import Footage from "./Footage";

const SKIP_REASONS = ["Bad moment", "Wrong vibe", "Don't post this athlete"];

export default function Review({
  pieces,
  onDecision,
  goToday,
  accent,
}: {
  pieces: Piece[];
  onDecision: (id: number, status: "approved" | "skipped", reason?: string | null) => void;
  goToday: () => void;
  accent: string;
}) {
  const queue = pieces.filter((p) => p.status === "ready");
  const piece = queue[0];
  const total = pieces.length;
  const doneCount = total - queue.length;

  const [hint, setHint] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  if (total === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <h2
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: BASE.ink,
            letterSpacing: "-0.02em",
          }}
        >
          Nothing to review yet
        </h2>
        <p
          style={{
            fontSize: 14,
            color: BASE.muted,
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          Upload a training session and your finished pieces land here.
        </p>
      </div>
    );
  }

  if (!piece)
    return <DoneScreen pieces={pieces} goToday={goToday} accent={accent} />;

  const approve = (p: Piece) => {
    setHint(false);
    setToast(`Approved · ${p.slot}`);
    setTimeout(() => setToast(null), 1600);
    setTimeout(() => onDecision(p.id, "approved"), 380);
  };
  const skip = (p: Piece, reason: string | null) => {
    setHint(false);
    setTimeout(() => onDecision(p.id, "skipped", reason), 340);
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <span style={{ fontSize: 13, fontWeight: 700, color: BASE.ink }}>
          {doneCount + 1} of {total}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: BASE.muted }}>
          Today&apos;s session
        </span>
      </div>
      <SwipeCard
        key={piece.id}
        piece={piece}
        next={queue[1]}
        accent={accent}
        showHint={hint && doneCount === 0}
        onInteract={() => setHint(false)}
        onApprove={() => approve(piece)}
        onSkip={(reason) => skip(piece, reason)}
      />
      {toast && (
        <div className="absolute inset-x-0 flex justify-center sl-rise" style={{ top: 8 }}>
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
            ✓ {toast}
          </span>
        </div>
      )}
    </div>
  );
}

// One card in the stack. Keyed by piece.id, so all swipe state resets
// naturally when the next piece slides up.
function SwipeCard({
  piece,
  next,
  accent,
  showHint,
  onInteract,
  onApprove,
  onSkip,
}: {
  piece: Piece;
  next?: Piece;
  accent: string;
  showHint: boolean;
  onInteract: () => void;
  onApprove: () => void;
  onSkip: (reason: string | null) => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fly, setFly] = useState<"left" | "right" | null>(null);
  const [sheet, setSheet] = useState(false);
  const [detail, setDetail] = useState(false);
  const startX = useRef<number | null>(null);
  const dxRef = useRef(0);
  const moved = useRef(false);

  const setDrag = (v: number) => {
    dxRef.current = v;
    setDx(v);
  };
  const approve = () => {
    onInteract();
    setFly("right");
    onApprove();
  };
  const askSkip = () => {
    onInteract();
    setSheet(true);
    setDrag(-56);
  };
  const skipWith = (reason: string | null) => {
    setSheet(false);
    setFly("left");
    onSkip(reason);
  };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (sheet || detail || fly) return;
    startX.current = e.clientX;
    moved.current = false;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    const d = e.clientX - startX.current;
    if (Math.abs(d) > 6) moved.current = true;
    setDrag(d);
  };
  const up = () => {
    if (startX.current === null) return;
    const d = dxRef.current;
    startX.current = null;
    setDragging(false);
    if (d > 90) approve();
    else if (d < -90) askSkip();
    else {
      setDrag(0);
      if (!moved.current) setDetail(true);
    }
  };

  const transform =
    fly === "right"
      ? "translateX(560px) rotate(16deg)"
      : fly === "left"
      ? "translateX(-560px) rotate(-14deg)"
      : `translateX(${dx}px) rotate(${dx / 22}deg)`;

  return (
    <>
      <div className="flex-1 relative px-5 pb-2" style={{ touchAction: "pan-y" }}>
        {next && (
          <div
            className="absolute rounded-3xl overflow-hidden"
            style={{
              inset: "12px 28px 22px",
              transform: "scale(0.96) translateY(8px)",
              opacity: 0.5,
            }}
          >
            <Footage piece={next} playing={false} />
          </div>
        )}
        <div
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="absolute rounded-3xl overflow-hidden"
          style={{
            inset: "0px 20px 12px",
            transform,
            transition: fly
              ? "transform 0.38s ease-in, opacity 0.38s"
              : dragging
              ? "none"
              : "transform 0.25s ease-out",
            opacity: fly ? 0 : 1,
            boxShadow: "0 30px 60px -25px rgba(0,0,0,0.45)",
            cursor: "grab",
            background: "#000",
          }}
        >
          <Footage piece={piece} />
          <div
            className="absolute"
            style={{
              top: 24,
              left: 20,
              opacity: Math.min(Math.max(dx / 90, 0), 1),
              transform: "rotate(-10deg)",
              border: `3px solid ${BASE.good}`,
              color: BASE.good,
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 20,
              padding: "2px 12px",
              background: "rgba(255,255,255,0.85)",
            }}
          >
            APPROVE
          </div>
          <div
            className="absolute"
            style={{
              top: 24,
              right: 20,
              opacity: Math.min(Math.max(-dx / 90, 0), 1),
              transform: "rotate(10deg)",
              border: "3px solid #B3261E",
              color: "#B3261E",
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 20,
              padding: "2px 12px",
              background: "rgba(255,255,255,0.85)",
            }}
          >
            SKIP
          </div>
          <div
            className="absolute inset-x-0 bottom-0 px-4 pt-8 pb-4"
            style={{
              background: "linear-gradient(to top, rgba(0,0,0,0.82), transparent)",
            }}
          >
            <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
              {piece.platforms.map((pl) => (
                <span
                  key={pl}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#fff",
                    background: "rgba(255,255,255,0.16)",
                    borderRadius: 999,
                    padding: "3px 9px",
                  }}
                >
                  {pl}
                </span>
              ))}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.7)",
                  marginLeft: "auto",
                }}
              >
                {piece.slot}
              </span>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.92)",
                lineHeight: 1.45,
              }}
            >
              {piece.caption.slice(0, 78)}…{" "}
              <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
                tap for details
              </span>
            </p>
          </div>
        </div>
        {showHint && !detail && !sheet && (
          <div
            className="absolute inset-x-0 flex justify-center sl-fade"
            style={{ bottom: 24, pointerEvents: "none" }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: "rgba(0,0,0,0.65)",
                borderRadius: 999,
                padding: "8px 16px",
              }}
            >
              Swipe right to approve · left to skip
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center pb-3" style={{ gap: 26 }}>
        <button
          onClick={askSkip}
          aria-label="Skip"
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            border: `1.5px solid ${BASE.faint}`,
            background: BASE.card,
            color: "#B3261E",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
        <button
          onClick={approve}
          aria-label="Approve"
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            border: "none",
            background: BASE.good,
            color: "#fff",
            fontSize: 24,
            cursor: "pointer",
            boxShadow: "0 14px 30px -12px rgba(30,127,79,0.6)",
          }}
        >
          ✓
        </button>
      </div>

      {sheet && (
        <div
          className="absolute inset-0 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onClick={() => {
            setSheet(false);
            setDrag(0);
          }}
        >
          <div
            className="sl-rise"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: BASE.card,
              borderRadius: "22px 22px 0 0",
              padding: "20px 20px 30px",
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 700, color: BASE.ink }}>
              Skip it — why?
            </p>
            <p style={{ fontSize: 12.5, color: BASE.muted, marginTop: 3 }}>
              Optional. Your answer teaches your employee.
            </p>
            <div className="flex flex-col mt-4" style={{ gap: 8 }}>
              {SKIP_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => skipWith(r)}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: BASE.ink,
                    background: BASE.paper,
                    border: `1px solid ${BASE.faint}`,
                    borderRadius: 14,
                    padding: "13px 16px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  {r}
                </button>
              ))}
              <button
                onClick={() => skipWith(null)}
                style={{
                  fontSize: 13,
                  color: BASE.muted,
                  background: "none",
                  border: "none",
                  marginTop: 4,
                  cursor: "pointer",
                }}
              >
                Just skip
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div
          className="absolute inset-0 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onClick={() => setDetail(false)}
        >
          <div
            className="sl-rise overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: BASE.card,
              borderRadius: "22px 22px 0 0",
              padding: "20px 20px 30px",
              maxHeight: "72%",
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
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#fff",
                background: TYPE_COLORS[piece.type] || "#555",
                borderRadius: 999,
                padding: "3px 9px",
                textTransform: "uppercase",
              }}
            >
              {piece.kind} · {piece.type}
            </span>
            <p
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: BASE.ink,
                marginTop: 10,
                letterSpacing: "-0.01em",
              }}
            >
              {piece.hook}
            </p>
            <p
              style={{
                fontSize: 14,
                color: BASE.ink,
                marginTop: 10,
                lineHeight: 1.55,
              }}
            >
              {piece.caption}
            </p>
            {piece.cta && (
              <p style={{ fontSize: 14, fontWeight: 700, color: BASE.ink, marginTop: 8 }}>
                {piece.cta}
              </p>
            )}
            {piece.tags && (
              <p style={{ fontSize: 13, color: accent, marginTop: 8, fontWeight: 600 }}>
                {piece.tags}
              </p>
            )}
            {piece.why && (
              <div
                style={{
                  background: BASE.paper,
                  borderRadius: 14,
                  padding: "12px 14px",
                  marginTop: 12,
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: BASE.muted,
                    textTransform: "uppercase",
                  }}
                >
                  Why I made this
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: BASE.ink,
                    marginTop: 5,
                    lineHeight: 1.5,
                  }}
                >
                  {piece.why}
                </p>
              </div>
            )}
            <p
              style={{
                fontSize: 12.5,
                color: BASE.muted,
                fontWeight: 600,
                marginTop: 14,
              }}
            >
              Suggested slot: {piece.slot} · {piece.platforms.join(" + ")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function DoneScreen({
  pieces,
  goToday,
  accent,
}: {
  pieces: Piece[];
  goToday: () => void;
  accent: string;
}) {
  const approved = pieces.filter(
    (p) => p.status === "approved" || p.status === "downloaded"
  ).length;
  const autopilot = 9 + approved;
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center px-8 text-center sl-rise"
      style={{ minHeight: 0, overflowY: "auto" }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 999,
          background: BASE.good,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 26,
          marginBottom: 18,
          boxShadow: "0 18px 40px -16px rgba(30,127,79,0.55)",
        }}
      >
        ✓
      </div>
      <h2
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: BASE.ink,
          letterSpacing: "-0.02em",
        }}
      >
        Your week is handled.
      </h2>
      <p
        style={{
          fontSize: 14,
          color: BASE.muted,
          marginTop: 8,
          lineHeight: 1.5,
        }}
      >
        {approved} post{approved === 1 ? "" : "s"} approved from one upload.
        <br />
        Next: film Thursday&apos;s session.
      </p>
      <div className="w-full mt-8 px-4">
        <DayStrip pieces={pieces} accent={accent} />
      </div>
      <div
        className="w-full mt-6"
        style={{
          background: BASE.card,
          border: `1px solid ${BASE.faint}`,
          borderRadius: 16,
          padding: "14px 16px",
          textAlign: "left",
        }}
      >
        <div className="flex items-center justify-between">
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: BASE.muted,
              textTransform: "uppercase",
            }}
          >
            Autopilot
          </p>
          <p style={{ fontSize: 11, fontWeight: 700, color: BASE.ink }}>
            {autopilot}/20
          </p>
        </div>
        <div
          style={{
            height: 5,
            borderRadius: 4,
            background: BASE.faint,
            marginTop: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min((autopilot / 20) * 100, 100)}%`,
              background: accent,
              borderRadius: 4,
              transition: "width 0.6s",
            }}
          />
        </div>
        <p
          style={{
            fontSize: 12,
            color: BASE.muted,
            marginTop: 8,
            lineHeight: 1.45,
          }}
        >
          {Math.max(20 - autopilot, 0)} more approvals and your employee can
          post without you — you&apos;ll only see what it isn&apos;t sure about.
        </p>
      </div>
      <button
        onClick={goToday}
        style={{
          marginTop: 32,
          border: "none",
          cursor: "pointer",
          borderRadius: 999,
          background: BASE.ink,
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          padding: "13px 30px",
        }}
      >
        Back to Today
      </button>
    </div>
  );
}
