import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing: exchange the one-time code for a session cookie,
// then send the coach into the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}/login`);
}
