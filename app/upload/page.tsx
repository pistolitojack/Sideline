"use client";

// Phase 3 — Upload: pick videos from the camera roll, resumable upload to
// Supabase storage with per-file progress, then create the session + job
// rows and show the calm "queued" state. The worker (Phase 4) takes it
// from there.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BASE } from "@/lib/design";
import { createClient } from "@/lib/supabase/client";
import { prettySize, probeVideo, uploadToStorage } from "@/lib/upload";

// Phase 1.1 — upload limits. Kept in sync with the database backstop in
// supabase/v5-upload-limits.sql (the 3-per-24h cap is enforced there too).
const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB per video
const MAX_FILES = 6; // videos per session
const MAX_SESSIONS_24H = 3; // sessions per coach per rolling 24 hours
const DAILY_LIMIT_MSG =
  "You've uploaded 3 sessions today — your employee is still working through them. Try again tomorrow.";

type Item = {
  file: File;
  progress: number; // 0..1
  state: "waiting" | "uploading" | "done" | "error";
  error?: string;
};

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"pick" | "uploading" | "queued" | "failed">(
    "pick"
  );
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null); // sessions left in 24h; null = still loading
  const [pickNote, setPickNote] = useState<string | null>(null);

  // Load how many sessions this coach has started in the last 24h so we can
  // show remaining quota and block once they're at the limit. Because this is
  // a live query against the database, a refresh or a private window sees the
  // same count — it can't be reset by reloading.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: coach } = await supabase
        .from("coaches")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (!coach) return;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coach.id)
        .gt("created_at", since);
      setRemaining(Math.max(0, MAX_SESSIONS_24H - (count ?? 0)));
    })();
  }, [router]);

  const quotaBlocked = remaining !== null && remaining <= 0;

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    setPickNote(null);
    const all = Array.from(files);
    const tooBig = all.filter((f) => f.size > MAX_FILE_BYTES);
    let ok = all.filter((f) => f.size <= MAX_FILE_BYTES);
    const notes: string[] = [];
    if (tooBig.length === 1) {
      notes.push(
        `"${tooBig[0].name}" is ${prettySize(
          tooBig[0].size
        )} — the limit is 200 MB per video, so it was left out.`
      );
    } else if (tooBig.length > 1) {
      notes.push(
        `${tooBig.length} clips were over the 200 MB per-video limit and were left out.`
      );
    }
    if (ok.length > MAX_FILES) {
      notes.push(
        `You can send up to ${MAX_FILES} videos per session — using the first ${MAX_FILES}.`
      );
      ok = ok.slice(0, MAX_FILES);
    }
    setPickNote(notes.length ? notes.join(" ") : null);
    setItems(
      ok.map((file) => ({
        file,
        progress: 0,
        state: "waiting" as const,
      }))
    );
  };

  const setItem = (i: number, patch: Partial<Item>) =>
    setItems((list) =>
      list.map((it, idx) => (idx === i ? { ...it, ...patch } : it))
    );

  const start = async () => {
    if (!items.length || phase === "uploading") return;
    if (quotaBlocked) {
      setFailMessage(DAILY_LIMIT_MSG);
      setPhase("failed");
      return;
    }
    setPhase("uploading");
    setFailMessage(null);
    const supabase = createClient();
    let sessionId: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: coach, error: coachErr } = await supabase
        .from("coaches")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (coachErr || !coach) throw new Error("profile");

      const sessionRow: Record<string, unknown> = {
        coach_id: coach.id,
        status: "uploading",
      };
      if (prompt.trim()) sessionRow.prompt = prompt.trim().slice(0, 500);
      const { data: sess, error: sessErr } = await supabase
        .from("sessions")
        .insert(sessionRow)
        .select("id")
        .single();
      if (sessErr || !sess) {
        // The database backstop rejected it — they hit the daily cap between
        // page load and now (e.g. a second tab). Show the friendly message.
        if (sessErr?.message?.includes("session_rate_limit")) {
          setRemaining(0);
          throw new Error(DAILY_LIMIT_MSG);
        }
        throw new Error("session");
      }
      sessionId = sess.id;

      for (let i = 0; i < items.length; i++) {
        const { file } = items[i];
        setItem(i, { state: "uploading" });
        const safeName = file.name.replace(/[^\w.\-]+/g, "-").slice(-80);
        const path = `${user.id}/${sess.id}/${i + 1}-${safeName}`;
        await uploadToStorage(file, path, (f) => setItem(i, { progress: f }));
        const meta = await probeVideo(file);
        const { error: assetErr } = await supabase.from("media_assets").insert({
          session_id: sess.id,
          storage_path: path,
          kind: "raw",
          duration_sec: meta.duration,
          width: meta.width,
          height: meta.height,
        });
        if (assetErr) throw new Error("asset");
        setItem(i, { state: "done", progress: 1 });
      }

      const { error: jobErr } = await supabase.from("jobs").insert({
        session_id: sess.id,
        stage: "ingest",
        status: "pending",
      });
      if (jobErr) throw new Error("job");
      const { error: qErr } = await supabase
        .from("sessions")
        .update({ status: "queued" })
        .eq("id", sess.id);
      if (qErr) throw new Error("queue");

      setPhase("queued");
    } catch (e) {
      if (sessionId) {
        await supabase
          .from("sessions")
          .update({ status: "failed" })
          .eq("id", sessionId);
      }
      setFailMessage(
        e instanceof Error && e.message.length > 20
          ? e.message
          : "That upload didn't work — give it another try."
      );
      setPhase("failed");
    }
  };

  /* ——— queued: the calm hand-off screen ——— */
  if (phase === "queued") {
    return (
      <Frame>
        <div className="flex-1 flex flex-col items-center justify-center text-center sl-rise">
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 999,
              background: BASE.good,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 32,
              boxShadow: "0 22px 45px -18px rgba(30,127,79,0.6)",
            }}
          >
            ✓
          </div>
          <h2
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: BASE.ink,
              letterSpacing: "-0.02em",
              marginTop: 22,
            }}
          >
            Your employee has it.
          </h2>
          <p
            style={{
              fontSize: 14.5,
              color: BASE.muted,
              marginTop: 10,
              lineHeight: 1.55,
              maxWidth: 280,
            }}
          >
            {items.length} video{items.length === 1 ? "" : "s"} uploaded and in
            line for cutting. You can close the app — Today will show the
            progress.
          </p>
          <button
            onClick={() => router.push("/")}
            style={{
              marginTop: 34,
              border: "none",
              cursor: "pointer",
              borderRadius: 999,
              background: BASE.ink,
              color: "#fff",
              fontSize: 14.5,
              fontWeight: 700,
              padding: "14px 34px",
            }}
          >
            Back to Today
          </button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame
      onBack={phase === "uploading" ? undefined : () => router.push("/")}
      title="New session"
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
      />

      {remaining !== null && remaining > 0 && remaining < MAX_SESSIONS_24H && (
        <p
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: BASE.muted,
            marginTop: 14,
            textAlign: "center",
          }}
        >
          {remaining} more session{remaining === 1 ? "" : "s"} today
        </p>
      )}

      {items.length === 0 ? (
        quotaBlocked ? (
          <div
            className="sl-rise"
            style={{
              marginTop: 18,
              minHeight: 300,
              borderRadius: 28,
              border: `1px solid ${BASE.faint}`,
              background: BASE.card,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "0 30px",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 999,
                background: "color-mix(in srgb, var(--accent) 12%, #fff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
              }}
            >
              ☕️
            </div>
            <p style={{ fontSize: 18, fontWeight: 800, color: BASE.ink }}>
              That&apos;s a wrap for today
            </p>
            <p
              style={{
                fontSize: 13.5,
                color: BASE.muted,
                lineHeight: 1.55,
                maxWidth: 300,
              }}
            >
              {DAILY_LIMIT_MSG}
            </p>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full sl-rise"
            style={{
              marginTop: 18,
              minHeight: 300,
              borderRadius: 28,
              border: `2px dashed color-mix(in srgb, var(--accent) 45%, ${BASE.faint})`,
              background: `linear-gradient(165deg, color-mix(in srgb, var(--accent) 6%, ${BASE.card}), ${BASE.card})`,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 999,
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 26,
                fontWeight: 300,
                boxShadow: "0 16px 34px -14px color-mix(in srgb, var(--accent) 70%, transparent)",
              }}
            >
              ↑
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 800, color: BASE.ink }}>
                Choose today&apos;s footage
              </p>
              <p style={{ fontSize: 13, color: BASE.muted, marginTop: 6 }}>
                Pick up to {MAX_FILES} clips from your camera roll
              </p>
            </div>
          </button>
        )
      ) : (
        <>
          <div className="flex flex-col sl-rise" style={{ gap: 10, marginTop: 18 }}>
            {items.map((it, i) => (
              <div
                key={i}
                style={{
                  background: BASE.card,
                  border: `1px solid ${BASE.faint}`,
                  borderRadius: 18,
                  padding: "14px 16px",
                  boxShadow: "0 12px 30px -22px rgba(26,25,21,0.4)",
                }}
              >
                <div className="flex items-center justify-between" style={{ gap: 10 }}>
                  <p
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: BASE.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.file.name}
                  </p>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color:
                        it.state === "done"
                          ? BASE.good
                          : it.state === "error"
                          ? "#B3261E"
                          : BASE.muted,
                      flexShrink: 0,
                    }}
                  >
                    {it.state === "done"
                      ? "Done ✓"
                      : it.state === "uploading"
                      ? `${Math.round(it.progress * 100)}%`
                      : it.state === "error"
                      ? "Failed"
                      : prettySize(it.file.size)}
                  </span>
                </div>
                <div
                  style={{
                    height: 5,
                    borderRadius: 4,
                    background: BASE.faint,
                    marginTop: 10,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round(it.progress * 100)}%`,
                      background:
                        it.state === "done" ? BASE.good : "var(--accent)",
                      borderRadius: 4,
                      transition: "width 0.25s ease-out",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {pickNote && (
            <p
              style={{
                fontSize: 12.5,
                color: BASE.muted,
                marginTop: 12,
                lineHeight: 1.5,
              }}
            >
              {pickNote}
            </p>
          )}

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
            rows={3}
            placeholder={
              "Optional \u2014 tell your employee what you want. Example: \u201cmake a hype reel from today\u2019s sled work\u201d or \u201cteaching breakdown of Marcus\u2019s first-step drill\u201d or leave blank and let me decide."
            }
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              color: BASE.ink,
              background: BASE.card,
              border: `1px solid ${BASE.faint}`,
              borderRadius: 16,
              padding: "12px 16px",
              width: "100%",
              marginTop: 10,
              outline: "none",
              resize: "none",
              fontFamily: "inherit",
            }}
          />

          {phase === "failed" && (
            <p
              style={{
                fontSize: 13.5,
                color: "#B3261E",
                marginTop: 14,
                lineHeight: 1.5,
              }}
            >
              {failMessage}
            </p>
          )}

          <div className="flex-1" style={{ minHeight: 18 }} />

          {phase === "uploading" ? (
            <p
              style={{
                fontSize: 13,
                color: BASE.muted,
                textAlign: "center",
                paddingBottom: 8,
                lineHeight: 1.5,
              }}
            >
              Uploading… keep the app open until the bars finish.
            </p>
          ) : (
            <>
              <button
                onClick={start}
                disabled={quotaBlocked}
                style={{
                  border: "none",
                  cursor: quotaBlocked ? "not-allowed" : "pointer",
                  borderRadius: 16,
                  background: quotaBlocked ? BASE.faint : BASE.ink,
                  color: quotaBlocked ? BASE.muted : "#fff",
                  fontSize: 15,
                  fontWeight: 700,
                  padding: "17px 0",
                  width: "100%",
                }}
              >
                {quotaBlocked
                  ? "Daily limit reached"
                  : phase === "failed"
                  ? "Try again"
                  : `Send to your employee (${items.length})`}
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  color: BASE.muted,
                  marginTop: 12,
                  width: "100%",
                }}
              >
                Pick different videos
              </button>
            </>
          )}
        </>
      )}
    </Frame>
  );
}

function Frame({
  children,
  onBack,
  title,
}: {
  children: React.ReactNode;
  onBack?: () => void;
  title?: string;
}) {
  return (
    <div
      className="mx-auto flex flex-col px-5 pb-6"
      style={{
        maxWidth: 430,
        minHeight: "100dvh",
        background: BASE.paper,
        paddingTop: 16,
      }}
    >
      {(onBack || title) && (
        <div className="flex items-center justify-between" style={{ flexShrink: 0 }}>
          {onBack ? (
            <button
              onClick={onBack}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: BASE.muted,
                fontWeight: 600,
                padding: 0,
              }}
            >
              ← Back
            </button>
          ) : (
            <span style={{ width: 44 }} />
          )}
          <span style={{ fontSize: 14, fontWeight: 700, color: BASE.ink }}>
            {title}
          </span>
          <span style={{ width: 44 }} />
        </div>
      )}
      {children}
    </div>
  );
}
