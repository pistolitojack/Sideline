"use client";

import { useState } from "react";
import { BASE } from "@/lib/design";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

const ACCENT = "#C8102E";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const configured = hasSupabaseEnv();

  const sendLink = async () => {
    if (!email.trim() || state === "sending") return;
    setState("sending");
    setErrorDetail(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setErrorDetail(error.message);
        setState("error");
      } else {
        setState("sent");
      }
    } catch (e) {
      setErrorDetail(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-6"
      style={{ background: BASE.paper }}
    >
      <div className="w-full" style={{ maxWidth: 390 }}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 16,
            marginBottom: 22,
            background: `linear-gradient(150deg, ${ACCENT}, #7E0A1D)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 22 }}>S</span>
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
          You coach. It films nothing, edits everything, and writes your whole
          week. Sign in with your email — no password to remember.
        </p>

        {!configured ? (
          <div
            style={{
              background: BASE.card,
              border: `1px solid ${BASE.faint}`,
              borderRadius: 16,
              padding: "16px 18px",
              marginTop: 24,
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 700, color: BASE.ink }}>
              Almost there — one setup step
            </p>
            <p
              style={{
                fontSize: 13,
                color: BASE.muted,
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              Login isn&apos;t connected yet. Add your Supabase keys to{" "}
              <code>.env.local</code> (see <code>.env.local.example</code>) and
              restart the app. To browse the app without login, set{" "}
              <code>NEXT_PUBLIC_DEMO_MODE=true</code> instead.
            </p>
          </div>
        ) : state === "sent" ? (
          <div
            className="sl-rise"
            style={{
              background: BASE.card,
              border: `1px solid ${BASE.faint}`,
              borderRadius: 16,
              padding: "16px 18px",
              marginTop: 24,
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 700, color: BASE.ink }}>
              Check your email ✉️
            </p>
            <p
              style={{
                fontSize: 13,
                color: BASE.muted,
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              We sent a sign-in link to <b>{email}</b>. Tap it on this device
              and you&apos;re in.
            </p>
          </div>
        ) : (
          <>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendLink()}
              placeholder="you@example.com"
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: BASE.ink,
                background: BASE.card,
                border: `1.5px solid ${BASE.faint}`,
                borderRadius: 14,
                padding: "14px 16px",
                width: "100%",
                marginTop: 24,
                outline: "none",
              }}
            />
            <button
              onClick={sendLink}
              disabled={!email.trim() || state === "sending"}
              style={{
                border: "none",
                cursor: email.trim() ? "pointer" : "default",
                borderRadius: 16,
                background: email.trim() ? ACCENT : BASE.faint,
                color: email.trim() ? "#fff" : BASE.muted,
                fontSize: 15,
                fontWeight: 700,
                padding: "16px 0",
                width: "100%",
                marginTop: 12,
              }}
            >
              {state === "sending" ? "Sending your link…" : "Email me a sign-in link"}
            </button>
            {state === "error" && (
              <p style={{ fontSize: 13, color: "#B3261E", marginTop: 10, lineHeight: 1.5 }}>
                That didn&apos;t work — try again in a moment.
                {errorDetail && (
                  <span
                    style={{
                      display: "block",
                      marginTop: 4,
                      fontSize: 12,
                      color: BASE.muted,
                    }}
                  >
                    Details: {errorDetail}
                  </span>
                )}
              </p>
            )}
          </>
        )}

        <p
          style={{
            fontSize: 12,
            color: BASE.muted,
            marginTop: 28,
            lineHeight: 1.5,
          }}
        >
          By signing in you agree to the{" "}
          <a href="/terms" style={{ textDecoration: "underline" }}>
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" style={{ textDecoration: "underline" }}>
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
