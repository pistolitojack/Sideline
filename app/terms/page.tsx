import { BASE } from "@/lib/design";

export const metadata = { title: "Terms of Service — Sideline" };

export default function TermsPage() {
  return (
    <div className="min-h-dvh px-6 py-10" style={{ background: BASE.paper }}>
      <div className="mx-auto" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: 14, color: BASE.muted, marginTop: 8 }}>
          Placeholder — full terms coming before public launch.
        </p>
        <div style={{ fontSize: 15, lineHeight: 1.6, marginTop: 24 }}>
          <p>
            Sideline turns your training footage into social-media content. You
            keep ownership of everything you upload and everything Sideline
            makes from it.
          </p>
          <p style={{ marginTop: 16, fontWeight: 700 }}>
            You are responsible for having permission (including
            parent/guardian consent for minors) to post the athletes in your
            footage.
          </p>
          <p style={{ marginTop: 16 }}>
            Don&apos;t upload content you don&apos;t have the rights to. We can
            suspend accounts that abuse the service.
          </p>
        </div>
        <a
          href="/login"
          style={{
            display: "inline-block",
            marginTop: 32,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "underline",
          }}
        >
          ← Back
        </a>
      </div>
    </div>
  );
}
