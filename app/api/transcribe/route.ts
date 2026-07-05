import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// transcribe(file) — wraps Deepgram so the provider can be swapped later (SPEC).
async function transcribe(audio: Blob, contentType: string): Promise<string> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("no-key");

  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": contentType || "audio/webm",
      },
      body: Buffer.from(await audio.arrayBuffer()),
    }
  );
  if (!res.ok) throw new Error(`deepgram-${res.status}`);
  const json = await res.json();
  return (
    json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ""
  );
}

export async function POST(request: Request) {
  // Only signed-in coaches may use the transcription key.
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Please sign in first." },
        { status: 401 }
      );
    }
  }

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json(
      { error: "No recording received — try again." },
      { status: 400 }
    );
  }
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: "That recording is too long — keep it under a minute." },
      { status: 400 }
    );
  }

  try {
    const transcript = await transcribe(audio, audio.type);
    return NextResponse.json({ transcript });
  } catch (e) {
    const msg = e instanceof Error && e.message === "no-key"
      ? "Transcription isn't set up yet (missing Deepgram key) — you can skip this step."
      : "We couldn't transcribe that — you can try again or skip this step.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
