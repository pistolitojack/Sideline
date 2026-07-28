"use client";

import { useEffect, useRef, useState } from "react";
import { TYPE_COLORS } from "@/lib/design";
import type { Piece } from "@/lib/types";

// A rendered piece as it appears in the app: poster frame, cycling burned-in
// caption words, type badge, duration. In Phase 5 this becomes a real <video>.
export default function Footage({
  piece,
  playing = true,
  small = false,
  accent = "#C8102E",
}: {
  piece: Piece;
  playing?: boolean;
  small?: boolean;
  accent?: string;
}) {
  const [wi, setWi] = useState(0);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(
      () => setWi((i) => (i + 1) % piece.words.length),
      620
    );
    return () => clearInterval(t);
  }, [playing, piece.id, piece.words.length]);

  return (
    <div
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: "#0D0C0A" }}
    >
      {piece.videoUrl && (!small || !piece.img) ? (
        <video
          ref={videoRef}
          src={piece.videoUrl}
          poster={piece.img || undefined}
          autoPlay={playing && !small}
          muted={muted}
          loop
          playsInline
          preload={playing && !small ? "metadata" : "none"}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: "cover" }}
        />
      ) : (
        piece.img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={piece.img}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: "cover" }}
          />
        )
      )}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "45%",
          background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
        }}
      />
      {!small && !piece.videoUrl && !piece.rendering && (
        <div
          className="absolute inset-x-0 flex items-center justify-center px-4"
          style={{ bottom: "26%" }}
        >
          <span
            style={{
              fontWeight: 800,
              fontSize: 26,
              lineHeight: 1.1,
              color: "#fff",
              textAlign: "center",
              textShadow: "0 2px 14px rgba(0,0,0,0.65)",
              letterSpacing: "-0.01em",
            }}
          >
            {piece.words[wi]}
          </span>
        </div>
      )}
      {piece.rendering && (
        // Video still rendering: poster + a subtle accent-tinted overlay.
        // Never loads a <video> — render_asset_id is null upstream.
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            background: `color-mix(in srgb, ${accent} 20%, rgba(0,0,0,0.45))`,
            gap: small ? 0 : 10,
          }}
        >
          <div
            className="sl-spin"
            style={{
              width: small ? 15 : 24,
              height: small ? 15 : 24,
              borderRadius: 999,
              border: `${small ? 2 : 3}px solid rgba(255,255,255,0.35)`,
              borderTopColor: "#fff",
            }}
          />
          {!small && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "0.01em",
                textShadow: "0 1px 6px rgba(0,0,0,0.55)",
              }}
            >
              Finishing edit…
            </span>
          )}
        </div>
      )}
      <div
        className="absolute flex items-center"
        style={{ top: small ? 6 : 12, left: small ? 6 : 12, gap: 5 }}
      >
        <span
          style={{
            fontSize: small ? 8 : 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#fff",
            background: TYPE_COLORS[piece.type] || "#555",
            borderRadius: 999,
            padding: small ? "2px 6px" : "3px 9px",
            textTransform: "uppercase",
          }}
        >
          {small ? piece.kind : piece.type}
        </span>
      </div>
      {!small && piece.videoUrl && (
        <button
          aria-label={muted ? "Unmute" : "Mute"}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => {
              const v = videoRef.current;
              if (v) {
                v.muted = !m ? true : false;
                if (m) v.play().catch(() => {});
              }
              return !m;
            });
          }}
          className="absolute"
          style={{
            bottom: "20%",
            right: 12,
            width: 40,
            height: 40,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(6px)",
            color: "#fff",
            fontSize: 17,
            cursor: "pointer",
            zIndex: 5,
          }}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      )}
      <div className="absolute" style={{ top: small ? 6 : 12, right: small ? 6 : 12 }}>
        <span
          style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: small ? 8 : 10,
            color: "rgba(255,255,255,0.9)",
            background: "rgba(0,0,0,0.4)",
            borderRadius: 6,
            padding: "2px 6px",
          }}
        >
          {piece.dur}
        </span>
      </div>
    </div>
  );
}
