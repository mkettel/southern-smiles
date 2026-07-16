"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupplyAccessPost } from "@/lib/supply-access";

export async function getCanAccessSupplies() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, practice_id")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") return true;
  if (!profile?.practice_id) return false;

  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("post:posts(title, division:divisions(number))")
    .eq("profile_id", user.id)
    .eq("practice_id", profile.practice_id);

  return (assignments ?? []).some((assignment) =>
    isSupplyAccessPost(
      assignment.post as {
        title?: string | null;
        division?: { number?: number | null } | null;
      } | null,
    ),
  );
}
