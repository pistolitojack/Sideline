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

  // Phase 1: a logged-in coach sees the shell with an empty queue.
  // Phase 2 replaces this with the coach's real profile from the DB.
  const coach = {
    name: user.email?.split("@")[0] ?? "Coach",
    mission: "More private clients",
    accentHex: "#C8102E",
  };
  return <AppShell coach={coach} initialPieces={[]} demo={false} />;
}
