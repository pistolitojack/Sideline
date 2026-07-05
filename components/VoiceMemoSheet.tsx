"use client";

// The onboarding voice memo, available any time from Today — for coaches who
// skipped it (or want a re-take). Records up to 60s in the browser,
// transcribes via /api/transcribe, saves to the coach's profile.

import { useEffect, useRef, useState } from "react";
import { BASE } from "@/lib/design";
import { createClient } from "@/lib/supabase/client";

const MAX_SECONDS = 60;

export default function VoiceMemoSheet({
  coachId,
  accent,
  onClose,
  onSaved,
}: {
  coachId: string;
  accent: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rec, setRec] = useState<
    "idle" | "recording" | "processing" | "saving" | "done"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  const startRecording = async () => {
    setNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec("processing");
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        try {
          const form = new FormData();
          form.append("audio", blob, "memo.webm");
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
          });
          const json = await res.json();
          if (!res.ok || !json.transcript) {
            setNote(json.error || "We couldn't transcribe that — try again.");
            setRec("idle");
            return;
          }
          setRec("saving");
          const { error } = await createClient()
            .from("coaches")
            .update({ voice_memo_transcript: json.transcript })
            .eq("id", coachId);
          if (error) {
            setNote("Saving didn't work — try again in a moment.");
            setRec("idle");
            return;
          }
          setRec("done");
          onSaved();
        } catch {
          setNote("We couldn't transcribe that — check your connection.");
          setRec("idle");
        }
      };
      recorder.start();
      setRec("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setNote("We couldn't reach your microphone — check permissions.");
    }
  };

  return (
    <div
      className="fixed inset-0 flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: 50 }}
      onClick={rec === "recording" ? undefined : onClose}
    >
      <div
        className="sl-rise"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#111009",
          borderRadius: "26px 26px 0 0",
          padding: "26px 24px calc(30px + env(safe-area-inset-bottom))",
          maxWidth: 430,
          margin: "0 auto",
          width: "100%",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 4,
            background: "rgba(255,255,255,0.25)",
            margin: "0 auto 18px",
          }}
        />
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.45)",
            textTransform: "uppercase",
          }}
        >
          Your voice
        </p>
        <p
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.02em",
            lineHeight: 1.35,
            marginTop: 10,
          }}
        >
          &ldquo;What do most coaches get wrong about training young
          athletes?&rdquo;
        </p>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.55)",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          Talk for up to 60 seconds. Your employee learns to write the way you
          actually sound.
        </p>
        <button
          onClick={() =>
            rec === "idle"
              ? startRecording()
              : rec === "recording"
              ? stop()
              : undefined
          }
          className={rec === "recording" ? "sl-pulse" : ""}
          style={{
            width: 84,
            height: 84,
            borderRadius: 999,
            marginTop: 26,
            cursor: "pointer",
            border:
              rec === "done"
                ? `3px solid ${BASE.good}`
                : "3px solid rgba(255,255,255,0.22)",
            background:
              rec === "done"
                ? BASE.good
                : rec === "processing" || rec === "saving"
                ? "#2E2B24"
                : accent,
            color: "#fff",
            fontSize: 28,
            transition: "all 0.3s",
          }}
        >
          {rec === "done" ? "✓" : rec === "recording" ? "■" : "●"}
        </button>
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(255,255,255,0.7)",
            marginTop: 14,
            minHeight: 20,
          }}
        >
          {rec === "idle" && "Tap to record"}
          {rec === "recording" &&
            `Listening… ${MAX_SECONDS - seconds}s left · tap to finish`}
          {rec === "processing" && "Writing it down…"}
          {rec === "saving" && "Saving…"}
          {rec === "done" && "Got it. I'll write like you talk."}
        </p>
        {note && (
          <p
            style={{
              fontSize: 12.5,
              color: "#F2B8B5",
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            {note}
          </p>
        )}
        <button
          onClick={onClose}
          style={{
            border: "none",
            cursor: "pointer",
            borderRadius: 16,
            background: rec === "done" ? accent : "#2E2B24",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            padding: "15px 0",
            width: "100%",
            marginTop: 22,
          }}
        >
          {rec === "done" ? "Done" : "Close"}
        </button>
      </div>
    </div>
  );
}
