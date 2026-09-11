import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

// Gate for the internal admin views.
//
// The real enforcement is row-level security in the database — `is_admin()`
// plus the admin read policies from supabase/v9-founder-ratings.sql. Without a
// row in `admins`, these queries return nothing no matter what the UI does.
// This check exists so a non-admin gets redirected instead of staring at an
// empty page.
export async function requireAdmin(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("admins")
    .select("email")
    .ilike("email", user.email ?? "")
    .maybeSingle();

  if (!data) redirect("/");
  return user;
}
