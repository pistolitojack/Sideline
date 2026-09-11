import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

// Gate for the internal admin views.
//
// Asks the database a single question — is_admin() — rather than reading the
// `admins` table from the app. That matters: is_admin() is SECURITY DEFINER,
// so it answers correctly regardless of row-level security, and it resolves the
// caller's email two ways (the JWT claim, falling back to auth.users by user
// id) so a token missing the email claim can't lock the founder out of their
// own tool.
//
// The real enforcement is still RLS — without a row in `admins`, every admin
// query returns nothing no matter what the UI decides. This check exists so a
// non-admin is redirected instead of staring at an empty page.
export async function requireAdmin(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ok } = await supabase.rpc("is_admin");
  if (!ok) redirect("/");
  return user;
}
