import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { DEMO_COACH, DEMO_PIECES, isDemoMode } from "@/lib/demo";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export default async function Home() {
  if (isDemoMode()) {
    return <AppShell coach={DEMO_COACH} initialPieces={DEMO_PIECES} demo />;
  }

  if (!hasSupabaseEnv()) {
    // Keys not configured yet — send to the login screen, which explains setup.
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load the coach's profile ("Coach DNA"). New signups go to onboarding.
  const { data: coachRow } = await supabase
    .from("coaches")
    .select("id, name, mission, accent_hex, voice_memo_transcript")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!coachRow) redirect("/onboarding");

  // The most recent session still working its way through the pipeline.
  const { data: activeSession } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("coach_id", coachRow.id)
    .in("status", ["uploading", "queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const coach = {
    name: coachRow.name,
    mission: coachRow.mission ?? "More private clients",
    accentHex: coachRow.accent_hex ?? "#C8102E",
  };
  return (
    <AppShell
      coach={coach}
      coachId={coachRow.id}
      hasVoiceMemo={Boolean(coachRow.voice_memo_transcript)}
      activeSession={activeSession ?? null}
      initialPieces={[]}
      demo={false}
    />
  );
}
