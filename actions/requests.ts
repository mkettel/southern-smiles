"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RequestType = "bug" | "feature" | "improvement";
export type RequestPriority = "low" | "medium" | "high";

export interface AppRequest {
  id: string;
  title: string;
  description: string | null;
  type: RequestType;
  priority: RequestPriority;
  is_completed: boolean;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  profile?: { full_name: string } | null;
}

export async function getRequests(): Promise<AppRequest[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data } = await supabase
    .from("requests")
    .select("*, profile:profiles(full_name)")
    .order("is_completed", { ascending: true })
    .order("created_at", { ascending: false });

  return (data as AppRequest[]) ?? [];
}

export async function getOpenRequestCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  // Check admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return 0;

  const { count } = await supabase
    .from("requests")
    .select("*", { count: "exact", head: true })
    .eq("is_completed", false);

  return count ?? 0;
}

export async function createRequest(input: {
  title: string;
  description?: string | null;
  type: RequestType;
  priority: RequestPriority;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (!input.title.trim()) {
    return { error: "Title is required" };
  }

  const { error } = await supabase.from("requests").insert({
    title: input.title.trim(),
    description: input.description?.trim() || null,
    type: input.type,
    priority: input.priority,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/requests");
  return { success: true };
}

export async function toggleRequest(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Get current state
  const { data: request } = await supabase
    .from("requests")
    .select("is_completed")
    .eq("id", id)
    .single();

  if (!request) return { error: "Request not found" };

  const nowCompleted = !request.is_completed;

  const { error } = await supabase
    .from("requests")
    .update({
      is_completed: nowCompleted,
      completed_at: nowCompleted ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/requests");
  return { success: true };
}

export async function deleteRequest(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("requests").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/requests");
  return { success: true };
}
