import { BASE } from "@/lib/design";

export const metadata = { title: "Privacy Policy — Sideline" };

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh px-6 py-10" style={{ background: BASE.paper }}>
      <div className="mx-auto" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 14, color: BASE.muted, marginTop: 8 }}>
          Placeholder — full policy coming before public launch.
        </p>
        <div style={{ fontSize: 15, lineHeight: 1.6, marginTop: 24 }}>
          <p>
            Your footage is stored privately and used only to create your
            content. We never sell your data or train public models on your
            videos.
          </p>
          <p style={{ marginTop: 16 }}>
            Deleting your account deletes your footage and generated content —
            real deletion, not a soft flag.
          </p>
          <p style={{ marginTop: 16, fontWeight: 700 }}>
            You are responsible for having permission (including
            parent/guardian consent for minors) to post the athletes in your
            footage.
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
