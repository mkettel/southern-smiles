"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { oicLogSchema } from "@/lib/validators";
import type { OicLogEntry } from "@/lib/types";

export async function getOicEntries(): Promise<OicLogEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("oic_log")
    .select("*, profile:profiles(*)")
    .order("effective_date", { ascending: false })
    .limit(100);

  return (data as OicLogEntry[]) ?? [];
}

export async function createOicEntry(input: {
  effective_date: string;
  area?: string | null;
  post_affected?: string | null;
  entry_text: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = oicLogSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase.from("oic_log").insert({
    ...parsed.data,
    profile_id: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/oic-log");
  return { success: true };
}
