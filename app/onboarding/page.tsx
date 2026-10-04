"use client";

// Onboarding — "The Interview" (SPEC.md screens §2, design from the prototype):
// welcome → Instagram handle (studying-your-page pause) → Coach DNA card →
// 60s voice memo (MediaRecorder + Deepgram) → mission → into the app.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCENTS, BASE, type Accent } from "@/lib/design";
import { createClient } from "@/lib/supabase/client";

// THE RULE THIS WHOLE FILE NOW FOLLOWS: a pre-selected answer is worse than no
// answer. A blank reaches the AI as "sport / focus: ?" and it knows it is
// guessing. A default reaches it as a fact and it reasons confidently from a
// lie — and nothing downstream can tell the two apart, because the coach who
// tapped straight through and the coach who meant it look identical in the
// database. Only the brand colour keeps a default: it is the caption colour,
// not a claim about who the coach is.

// Five sports and no escape hatch meant a volleyball, swimming or track coach
// had to pick something false — while the AI reads sport five times as fact.
// The "Something else" box is what makes requiring an answer fair: without it,
// demanding one would force the lie rather than prevent it.
const SPORTS = [
  "Speed & agility",
  "Strength",
  "Soccer",
  "Basketball",
  "Combat sports",
];
const TONES = ["Direct", "Encouraging", "No-nonsense", "Funny", "Technical"];
// P1 fix: who the coach actually trains. Previously hardcoded to
// "Youth athletes & their parents" for everyone, while the AI read it four
// times and treated it as fact. Nothing is pre-selected — a default here is a
// confident lie the AI cannot tell apart from a real answer.
const AUDIENCES = [
  "Youth athletes & their parents",
  "High school athletes",
  "College & pro athletes",
  "Adult general fitness",
  "Combat sports athletes",
];
// "Not sure yet" is a real answer, not a blank. A coach who genuinely has no
// single goal right now should be able to say so in one tap instead of picking
// the least-wrong chip — which is the behaviour a required field would
// otherwise produce, and exactly the fiction this screen is trying to stop.
const MISSIONS = [
  "More private clients",
  "Fill the fall program",
  "Build the brand",
  "Sell online coaching",
  "Not sure yet",
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
  const [step, setStep] = useState(0); // 0 welcome · 1 handle · 2 dna · 3 voice · 4 mission · 5 city
  const total = 6;

  const [handle, setHandle] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [name, setName] = useState("");
  // True when a profile already exists, so the screens can say "update" rather
  // than greet someone who has been using the app for weeks as a stranger.
  const [returning, setReturning] = useState(false);
  const [sport, setSport] = useState("");
  const [customSport, setCustomSport] = useState("");
  // The colour keeps its default on purpose — it decides what the burned-in
  // captions look like, and the AI never reasons from it.
  const [accent, setAccent] = useState<Accent>(ACCENTS[0]);
  // Optional. Tones are a style hint worth 2 uses, and if a coach records the
  // voice memo their actual rhythm and word choice carry far more than five
  // adjectives would. Better empty than invented.
  const [tones, setTones] = useState<string[]>([]);
  const [audience, setAudience] = useState("");
  const [customAudience, setCustomAudience] = useState("");
  const [mission, setMission] = useState("");
  const [customMission, setCustomMission] = useState("");
  const [city, setCity] = useState("");
  // Named stateRegion because `state` reads like React state everywhere else
  // in this file.
  const [stateRegion, setStateRegion] = useState("");

  const [rec, setRec] = useState<"idle" | "recording" | "processing" | "done">(
    "idle"
  );
  const [recSeconds, setRecSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [memoNote, setMemoNote] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // P3 fix: the handle already on file. The save used to null out ig_profile
  // unconditionally, so fixing a typo in your name destroyed the scraped
  // Instagram summary the AI uses five times.
  const savedHandle = useRef<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const ac = accent.a;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Load the handle already on file so the save can tell whether it changed.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("coaches")
        .select(
          "name, sport, tones, accent_hex, audience, mission, city, state, ig_handle, voice_memo_transcript",
        )
        .eq("auth_user_id", user.id)
        .maybeSingle();
      savedHandle.current = data?.ig_handle ?? null;
      if (!data) return;

      // RETURNING COACH — pre-fill everything (P2).
      //
      // Without this, re-running onboarding to change one answer meant retyping
      // every other one, and anything left untouched was saved back as a
      // default. The screen built to stop the AI being lied to would have been
      // the thing doing the lying.
      setReturning(true);
      setName(data.name ?? "");
      // A sport the chips do not offer came from the "Something else" box, so
      // it belongs back in that box rather than silently matching no chip.
      if (data.sport) {
        if (SPORTS.includes(data.sport)) setSport(data.sport);
        else setCustomSport(data.sport);
      }
      if (Array.isArray(data.tones)) setTones(data.tones);
      const savedAccent = ACCENTS.find((c) => c.a === data.accent_hex);
      if (savedAccent) setAccent(savedAccent);
      if (data.audience) {
        if (AUDIENCES.includes(data.audience)) setAudience(data.audience);
        else setCustomAudience(data.audience);
      }
      if (data.mission) {
        if (MISSIONS.includes(data.mission)) setMission(data.mission);
        else setCustomMission(data.mission);
      }
      setCity(data.city ?? "");
      setStateRegion(data.state ?? "");
      setHandle(data.ig_handle ?? "");
      // Loaded so a coach who does not re-record keeps the memo they already
      // gave. See the save() comment — this is the same trap the Instagram
      // summary fell into.
      setTranscript(data.voice_memo_transcript ?? "");
    })();
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
      const newHandle = handle.trim() || null;
      // Upsert: running onboarding again UPDATES the coach's profile.
      const { error } = await supabase.from("coaches").upsert(
        {
          auth_user_id: user.id,
          name: name.trim() || "Coach",
          // NULL, never "". The prompts render a missing value as "?" so the AI
          // knows it is guessing; an empty string would reach it as a blank
          // after the label, which reads like an answer nobody gave.
          sport: customSport.trim() || sport || null,
          tones,
          accent_hex: accent.a,
          audience: customAudience.trim() || audience || null,
          mission: customMission.trim() || mission || null,
          city: city.trim() || null,
          state: stateRegion.trim() || null,
          ig_handle: newHandle,
          // Written only when there is something to write. A returning coach who
          // skips the recording screen must not lose the memo they already gave
          // — it is the composer's only sample of how they actually talk, and
          // `transcript || null` would have overwritten it with null the moment
          // pre-fill made re-running onboarding a normal thing to do.
          ...(transcript ? { voice_memo_transcript: transcript } : {}),
          // Only discard the scraped Instagram summary when the handle
          // ACTUALLY changed. Omitting the key leaves the stored value alone,
          // because upsert only writes the columns it is given.
          ...(newHandle !== savedHandle.current ? { ig_profile: null } : {}),
        },
        { onConflict: "auth_user_id" }
      );
      if (error) throw error;
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
            Talk for up to 60 seconds. Your employee copies how you
            sound — your rhythm and word choice — never what you say here.
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
            {returning ? (
              <>
                Update your
                <br />
                Coach DNA.
              </>
            ) : (
              <>
                Meet your new
                <br />
                marketing employee.
              </>
            )}
          </h1>
          <p
            style={{
              fontSize: 15,
              color: BASE.muted,
              marginTop: 14,
              lineHeight: 1.55,
            }}
          >
            {returning
              ? "Everything you told it is already filled in. Change what has moved on — your sport, your tone, who you're making this for, what you're chasing right now — and leave the rest alone."
              : "You coach. It films nothing, edits everything, and writes your whole week. First, a three-minute interview — it studies your page so it never asks what it can learn."}
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
        {[1, 2, 3, 4, 5].map((s) => (
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
                on={sport === s && !customSport.trim()}
                onClick={() => {
                  setSport(s);
                  setCustomSport("");
                }}
                ac={ac}
              />
            ))}
          </div>
          <input
            value={customSport}
            onChange={(e) => setCustomSport(e.target.value)}
            placeholder="Something else — volleyball, swimming, track…"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: BASE.ink,
              background: BASE.card,
              border: `1.5px solid ${BASE.faint}`,
              borderRadius: 14,
              padding: "12px 16px",
              width: "100%",
              marginTop: 9,
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
            You sound{" "}
            <span style={{ fontWeight: 600, color: BASE.muted }}>
              — optional
            </span>
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
          {/* A hardcoded line used to sit here claiming "Audience read from
              your page: youth athletes & their parents" to anyone who entered an
              Instagram handle. Nothing read it from their page — it was static
              text left over from when audience was hardcoded for every coach.
              It told the coach a fabricated fact about themselves AND primed
              them to accept the same answer on the audience screen two steps
              later, which quietly corrupted the one field we had just fixed. */}
          <div className="flex-1" style={{ minHeight: 16 }} />
          <ObButton
            label="That's me"
            onClick={() => setStep(3)}
            ac={ac}
            disabled={!name.trim() || !(customSport.trim() || sport)}
          />
        </>
      )}

      {step === 4 && (
        <>
          <H
            kicker={`5 of ${total} · Who it's for`}
            title="Who are you making this for?"
            sub="Your employee writes every hook and call-to-action at these people. Get this right and everything downstream aims at the right audience."
          />
          <div className="flex flex-wrap" style={{ gap: 8, marginTop: 18 }}>
            {AUDIENCES.map((a) => (
              <Chip
                key={a}
                label={a}
                on={audience === a && !customAudience.trim()}
                onClick={() => {
                  setAudience(a);
                  setCustomAudience("");
                }}
                ac={ac}
              />
            ))}
          </div>
          <input
            value={customAudience}
            onChange={(e) => setCustomAudience(e.target.value)}
            placeholder="Or describe them yourself…"
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

          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: BASE.ink,
              marginTop: 22,
              marginBottom: 7,
            }}
          >
            And the mission right now?
          </p>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
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
          <div className="flex-1" />
          <ObButton
            label="Continue"
            onClick={() => setStep(5)}
            ac={ac}
            disabled={
              !(customAudience.trim() || audience) ||
              !(customMission.trim() || mission)
            }
          />
        </>
      )}

      {step === 5 && (
        <>
          <H
            kicker={`6 of ${total} · Your turf`}
            title="Where do you coach?"
            sub="This shapes location hashtags and audience tuning."
          />
          {/* Two boxes, not one. This was a single input whose placeholder
              already read "City, State", and it still came back holding just
              "GA". One box asking for two things reliably gets one of them. */}
          <div className="flex" style={{ gap: 10, marginTop: 18 }}>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: BASE.ink,
                background: BASE.card,
                border: `1.5px solid ${BASE.faint}`,
                borderRadius: 14,
                padding: "13px 16px",
                flex: 2,
                minWidth: 0,
                outline: "none",
              }}
            />
            <input
              value={stateRegion}
              onChange={(e) => setStateRegion(e.target.value)}
              placeholder="State"
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: BASE.ink,
                background: BASE.card,
                border: `1.5px solid ${BASE.faint}`,
                borderRadius: 14,
                padding: "13px 16px",
                flex: 1,
                minWidth: 0,
                outline: "none",
              }}
            />
          </div>
          {saveError && (
            <p style={{ fontSize: 13, color: "#B3261E", marginTop: 12 }}>
              {saveError}
            </p>
          )}
          <div className="flex-1" />
          <ObButton
            label={
              saving
                ? returning
                  ? "Saving…"
                  : "Setting up your employee…"
                : returning
                  ? "Save changes"
                  : "Let's go"
            }
            onClick={finish}
            ac={ac}
            disabled={saving}
          />
        </>
      )}
    </div>
  );
}
