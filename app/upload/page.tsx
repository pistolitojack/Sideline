"use client";

// Phase 3 — Upload: pick videos from the camera roll, resumable upload to
// Supabase storage with per-file progress, then create the session + job
// rows and show the calm "queued" state. The worker (Phase 4) takes it
// from there.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BASE } from "@/lib/design";
import { createClient } from "@/lib/supabase/client";
import { prettySize, probeVideo, uploadToStorage } from "@/lib/upload";

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
  const [montage, setMontage] = useState(false);
  const [brief, setBrief] = useState("");
  const [phase, setPhase] = useState<"pick" | "uploading" | "queued" | "failed">(
    "pick"
  );
  const [failMessage, setFailMessage] = useState<string | null>(null);

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    setItems(
      Array.from(files).map((file) => ({
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
      if (montage) sessionRow.montage = true;
      if (brief.trim()) sessionRow.brief = brief.trim().slice(0, 500);
      const { data: sess, error: sessErr } = await supabase
        .from("sessions")
        .insert(sessionRow)
        .select("id")
        .single();
      if (sessErr || !sess) throw new Error("session");
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

      {items.length === 0 ? (
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
              Pick as many clips as you like from your camera roll
            </p>
          </div>
        </button>
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

          <button
            onClick={() => setMontage((m) => !m)}
            className="w-full mt-3 flex items-center sl-card-press"
            style={{
              border: montage
                ? `1.5px solid var(--accent)`
                : `1px solid ${BASE.faint}`,
              background: montage
                ? "color-mix(in srgb, var(--accent) 7%, #fff)"
                : BASE.card,
              borderRadius: 16,
              padding: "13px 16px",
              cursor: "pointer",
              gap: 10,
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                flexShrink: 0,
                border: montage ? "none" : `1.5px solid ${BASE.faint}`,
                background: montage ? "var(--accent)" : BASE.paper,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              {montage ? "✓" : ""}
            </span>
            <span>
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: BASE.ink,
                  display: "block",
                }}
              >
                Mix-tape reel
              </span>
              <span
                style={{ fontSize: 12, color: BASE.muted, display: "block" }}
              >
                Also cut one fast montage using ALL of these videos
              </span>
            </span>
          </button>

          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value.slice(0, 500))}
            rows={2}
            placeholder={
              "Tell your employee anything (optional): \u201cfocus on the girl in blue\u201d, \u201cmake it funny\u201d, \u201cchampionship day\u201d\u2026"
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
                style={{
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 16,
                  background: BASE.ink,
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 700,
                  padding: "17px 0",
                  width: "100%",
                }}
              >
                {phase === "failed"
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
