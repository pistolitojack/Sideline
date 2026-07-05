"use client";

// Onboarding — "The Interview" (SPEC.md screens §2, design from the prototype):
// welcome → Instagram handle (studying-your-page pause) → Coach DNA card →
// 60s voice memo (MediaRecorder + Deepgram) → mission → into the app.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCENTS, BASE, type Accent } from "@/lib/design";
import { createClient } from "@/lib/supabase/client";

const SPORTS = [
  "Speed & agility",
  "Strength",
  "Soccer",
  "Basketball",
  "Combat sports",
];
const TONES = ["Direct", "Encouraging", "No-nonsense", "Funny", "Technical"];
const MISSIONS = [
  "More private clients",
  "Fill the fall program",
  "Build the brand",
  "Sell online coaching",
];
const MAX_MEMO_SECONDS = 60;

function Chip({
  label,
  on,
  onClick,
  ac,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  ac: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: on ? "#fff" : BASE.ink,
        background: on ? ac : BASE.card,
        border: `1.5px solid ${on ? ac : BASE.faint}`,
        borderRadius: 999,
        padding: "10px 18px",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function ObButton({
  label,
  onClick,
  ac,
  disabled,
}: {
  label: string;
  onClick: () => void;
  ac: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        cursor: disabled ? "default" : "pointer",
        borderRadius: 16,
        background: disabled ? BASE.faint : ac,
        color: disabled ? BASE.muted : "#fff",
        fontSize: 15,
        fontWeight: 700,
        padding: "16px 0",
        width: "100%",
        transition: "background 0.2s",
      }}
    >
      {label}
    </button>
  );
}

function H({
  kicker,
  title,
  sub,
}: {
  kicker: string;
  title: string;
  sub?: string;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: BASE.muted,
          textTransform: "uppercase",
        }}
      >
        {kicker}
      </p>
      <h2
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: BASE.ink,
          letterSpacing: "-0.02em",
          marginTop: 6,
          lineHeight: 1.15,
        }}
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            fontSize: 14,
            color: BASE.muted,
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0 welcome · 1 handle · 2 dna · 3 voice · 4 mission
  const total = 5;

  const [handle, setHandle] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [name, setName] = useState("");
  const [sport, setSport] = useState("Speed & agility");
  const [accent, setAccent] = useState<Accent>(ACCENTS[0]);
  const [tones, setTones] = useState<string[]>(["Direct", "Encouraging"]);
  const [mission, setMission] = useState("More private clients");
  const [customMission, setCustomMission] = useState("");

  const [rec, setRec] = useState<"idle" | "recording" | "processing" | "done">(
    "idle"
  );
  const [recSeconds, setRecSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [memoNote, setMemoNote] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const ac = accent.a;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startScan = () => {
    // V1: just store the handle; the "studying your page" moment is a 2s pause
    // (real scraping is V2 per SPEC).
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setScanned(true);
      setStep(2);
    }, 2000);
  };

  const toggleTone = (t: string) =>
    setTones((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  const startRecording = async () => {
    setMemoNote(null);
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
          if (res.ok && json.transcript) {
            setTranscript(json.transcript);
            setRec("done");
          } else {
            setMemoNote(json.error || "We couldn't transcribe that.");
            setRec("idle");
          }
        } catch {
          setMemoNote("We couldn't transcribe that — check your connection.");
          setRec("idle");
        }
      };
      recorder.start();
      setRec("recording");
      setRecSeconds(0);
      timerRef.current = setInterval(() => {
        setRecSeconds((s) => {
          if (s + 1 >= MAX_MEMO_SECONDS) stopRecording();
          return s + 1;
        });
      }, 1000);
    } catch {
      setMemoNote(
        "We couldn't reach your microphone — check permissions, or skip this step."
      );
    }
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { error } = await supabase.from("coaches").insert({
        auth_user_id: user.id,
        name: name.trim() || "Coach",
        sport,
        tones,
        accent_hex: accent.a,
        audience: "Youth athletes & their parents",
        mission: customMission.trim() || mission,
        ig_handle: handle.trim() || null,
        voice_memo_transcript: transcript || null,
      });
      // Already onboarded (duplicate row)? Just go into the app.
      if (error && error.code !== "23505") throw error;
      router.push("/");
      router.refresh();
    } catch {
      setSaveError(
        "Saving your profile didn't work — give it another try in a moment."
      );
      setSaving(false);
    }
  };

  /* — voice memo has its own dark layout — */
  if (step === 3) {
    return (
      <div
        className="mx-auto flex flex-col items-center px-8 pb-8 text-center"
        style={{ maxWidth: 430, minHeight: "100dvh", background: "#111009" }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.45)",
            textTransform: "uppercase",
            marginTop: 26,
          }}
        >
          4 of {total} · Your voice
        </p>
        <div className="flex-1 flex flex-col items-center justify-center">
          <p
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.02em",
              lineHeight: 1.3,
            }}
          >
            &ldquo;What do most coaches get wrong about training young
            athletes?&rdquo;
          </p>
          <p
            style={{
              fontSize: 13.5,
              color: "rgba(255,255,255,0.55)",
              marginTop: 12,
              lineHeight: 1.5,
            }}
          >
            Talk for up to 60 seconds. This one recording teaches your employee
            how you actually sound.
          </p>
          <button
            onClick={() =>
              rec === "idle"
                ? startRecording()
                : rec === "recording"
                ? stopRecording()
                : undefined
            }
            className={rec === "recording" ? "sl-pulse" : ""}
            style={{
              width: 92,
              height: 92,
              borderRadius: 999,
              marginTop: 36,
              cursor: "pointer",
              border:
                rec === "done"
                  ? `3px solid ${BASE.good}`
                  : "3px solid rgba(255,255,255,0.25)",
              background:
                rec === "done"
                  ? BASE.good
                  : rec === "processing"
                  ? "#2E2B24"
                  : accent.a,
              color: "#fff",
              fontSize: 30,
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
              marginTop: 16,
              minHeight: 20,
            }}
          >
            {rec === "idle" && "Tap to record"}
            {rec === "recording" &&
              `Listening… ${MAX_MEMO_SECONDS - recSeconds}s left · tap to finish`}
            {rec === "processing" && "Writing it down…"}
            {rec === "done" && "Got it. I'll write like you talk."}
          </p>
          {memoNote && (
            <p
              style={{
                fontSize: 12.5,
                color: "#F2B8B5",
                marginTop: 10,
                lineHeight: 1.5,
                maxWidth: 300,
              }}
            >
              {memoNote}
            </p>
          )}
        </div>
        <div style={{ width: "100%" }}>
          <ObButton
            label={rec === "done" ? "Continue" : "Skip this"}
            onClick={() => setStep(4)}
            ac={rec === "done" ? accent.a : "#2E2B24"}
          />
        </div>
      </div>
    );
  }

  /* — welcome — */
  if (step === 0) {
    return (
      <div
        className="mx-auto flex flex-col px-6 pb-8"
        style={{ maxWidth: 430, minHeight: "100dvh", background: BASE.paper }}
      >
        <div className="flex-1 flex flex-col justify-center">
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              marginBottom: 22,
              background: `linear-gradient(150deg, ${ac}, ${accent.d})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 22 }}>
              S
            </span>
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: BASE.ink,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            Meet your new
            <br />
            marketing employee.
          </h1>
          <p
            style={{
              fontSize: 15,
              color: BASE.muted,
              marginTop: 14,
              lineHeight: 1.55,
            }}
          >
            You coach. It films nothing, edits everything, and writes your
            whole week. First, a three-minute interview — it studies your page
            so it never asks what it can learn.
          </p>
        </div>
        <ObButton label="Start the interview" onClick={() => setStep(1)} ac={ac} />
        <p
          style={{
            fontSize: 12,
            color: BASE.muted,
            marginTop: 14,
            textAlign: "center",
          }}
        >
          By continuing you agree to the{" "}
          <a href="/terms" style={{ textDecoration: "underline" }}>
            Terms
          </a>{" "}
          &{" "}
          <a href="/privacy" style={{ textDecoration: "underline" }}>
            Privacy Policy
          </a>
          .
        </p>
      </div>
    );
  }

  /* — light steps share the progress bar — */
  return (
    <div
      className="mx-auto flex flex-col px-6 pb-6"
      style={{
        maxWidth: 430,
        minHeight: "100dvh",
        background: BASE.paper,
        paddingTop: 18,
      }}
    >
      <div className="flex items-center" style={{ gap: 5, marginBottom: 22 }}>
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 3.5,
              borderRadius: 4,
              background: step >= s ? ac : BASE.faint,
              transition: "background 0.3s",
            }}
          />
        ))}
      </div>

      {step === 1 && (
        <>
          <H
            kicker={`2 of ${total} · Your brand`}
            title="Drop your Instagram."
            sub="Your employee studies your page first — colors, voice, what already works — so it never asks a question it could answer itself."
          />
          <div
            className="flex items-center mt-5"
            style={{
              background: BASE.card,
              border: `1.5px solid ${BASE.faint}`,
              borderRadius: 14,
              padding: "4px 4px 4px 16px",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: BASE.muted }}>
              @
            </span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourhandle"
              autoCapitalize="none"
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: BASE.ink,
                background: "none",
                border: "none",
                outline: "none",
                flex: 1,
                padding: "12px 8px",
              }}
            />
          </div>
          {scanning && (
            <div className="flex items-center mt-5" style={{ gap: 10 }}>
              <div
                className="sl-spin"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  border: `2.5px solid ${BASE.faint}`,
                  borderTopColor: ac,
                }}
              />
              <span
                style={{ fontSize: 13.5, color: BASE.muted, fontWeight: 600 }}
              >
                Reading your page…
              </span>
            </div>
          )}
          <div className="flex-1" />
          <ObButton
            label={scanning ? "Studying your page…" : "Scan my page"}
            onClick={startScan}
            ac={ac}
            disabled={!handle.trim() || scanning}
          />
          <button
            onClick={() => setStep(2)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              color: BASE.muted,
              marginTop: 12,
            }}
          >
            I don&apos;t have one yet
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <H
            kicker={`3 of ${total} · Your Coach DNA`}
            title={
              scanned
                ? "Here's what I learned. Fix anything I got wrong."
                : "Tell me the basics."
            }
            sub={
              scanned
                ? "Pulled from your page in four seconds. Correct me — every fix makes me sharper."
                : "Thirty seconds, then I take it from here."
            }
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name or coach name"
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: BASE.ink,
              background: BASE.card,
              border: `1.5px solid ${BASE.faint}`,
              borderRadius: 14,
              padding: "12px 16px",
              width: "100%",
              marginTop: 14,
              outline: "none",
            }}
          />
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: BASE.ink,
              marginTop: 14,
              marginBottom: 7,
            }}
          >
            You coach
          </p>
          <div className="flex flex-wrap" style={{ gap: 7 }}>
            {SPORTS.map((s) => (
              <Chip
                key={s}
                label={s}
                on={sport === s}
                onClick={() => setSport(s)}
                ac={ac}
              />
            ))}
          </div>
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: BASE.ink,
              marginTop: 14,
              marginBottom: 7,
            }}
          >
            Your brand color
          </p>
          <div className="flex items-center" style={{ gap: 10 }}>
            {ACCENTS.map((c) => (
              <button
                key={c.a}
                onClick={() => setAccent(c)}
                aria-label={c.name}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  background: c.a,
                  cursor: "pointer",
                  border:
                    accent.a === c.a
                      ? `3px solid ${BASE.ink}`
                      : "3px solid transparent",
                  transition: "all 0.15s",
                }}
              />
            ))}
          </div>
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: BASE.ink,
              marginTop: 14,
              marginBottom: 7,
            }}
          >
            You sound
          </p>
          <div className="flex flex-wrap" style={{ gap: 7 }}>
            {TONES.map((t) => (
              <Chip
                key={t}
                label={t}
                on={tones.includes(t)}
                onClick={() => toggleTone(t)}
                ac={ac}
              />
            ))}
          </div>
          {scanned && (
            <p style={{ fontSize: 12.5, color: BASE.muted, marginTop: 14 }}>
              Audience read from your page:{" "}
              <span style={{ fontWeight: 700, color: BASE.ink }}>
                youth athletes &amp; their parents
              </span>
            </p>
          )}
          <div className="flex-1" style={{ minHeight: 16 }} />
          <ObButton
            label="That's me"
            onClick={() => setStep(3)}
            ac={ac}
            disabled={!name.trim()}
          />
        </>
      )}

      {step === 4 && (
        <>
          <H
            kicker={`5 of ${total} · The mission`}
            title="What's the mission right now?"
            sub="One goal. Every clip choice, hook, and call-to-action aims at it. Change it any time with one tap — you'll never be quizzed."
          />
          <div className="flex flex-wrap" style={{ gap: 8, marginTop: 18 }}>
            {MISSIONS.map((m) => (
              <Chip
                key={m}
                label={m}
                on={mission === m && !customMission.trim()}
                onClick={() => {
                  setMission(m);
                  setCustomMission("");
                }}
                ac={ac}
              />
            ))}
          </div>
          <input
            value={customMission}
            onChange={(e) => setCustomMission(e.target.value)}
            placeholder="Or type your own…"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: BASE.ink,
              background: BASE.card,
              border: `1.5px solid ${BASE.faint}`,
              borderRadius: 14,
              padding: "13px 16px",
              width: "100%",
              marginTop: 12,
              outline: "none",
            }}
          />
          {saveError && (
            <p style={{ fontSize: 13, color: "#B3261E", marginTop: 12 }}>
              {saveError}
            </p>
          )}
          <div className="flex-1" />
          <ObButton
            label={saving ? "Setting up your employee…" : "Let's go"}
            onClick={finish}
            ac={ac}
            disabled={saving}
          />
        </>
      )}
    </div>
  );
}
