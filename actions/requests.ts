"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RequestType = "bug" | "feature" | "improvement";
export type RequestPriority = "low" | "medium" | "high";
export type RequestStatus = "open" | "in_progress" | "in_review" | "completed";

export interface AppRequest {
  id: string;
  title: string;
  description: string | null;
  type: RequestType;
  priority: RequestPriority;
  status: RequestStatus;
  is_completed: boolean;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  profile?: { full_name: string } | null;
}

export async function getRequests(): Promise<(AppRequest & { comment_count: number })[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data } = await supabase
    .from("requests")
    .select("*, profile:profiles(full_name), request_comments(count)")
    .order("is_completed", { ascending: true })
    .order("created_at", { ascending: false });

  return (
    (data as (AppRequest & { request_comments: { count: number }[] })[])?.map(
      (r) => ({
        ...r,
        comment_count: r.request_comments?.[0]?.count ?? 0,
      })
    ) ?? []
  );
}

export async function getOpenRequestCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return 0;

  const { count } = await supabase
    .from("requests")
    .select("*", { count: "exact", head: true })
    .neq("status", "completed");

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
    status: "open",
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/requests");
  return { success: true };
}

export async function updateRequestStatus(id: string, status: RequestStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const update: Record<string, unknown> = {
    status,
    is_completed: status === "completed",
    completed_at: status === "completed" ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from("requests")
    .update(update)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/requests");
  return { success: true };
}

// Keep for backwards compat — wraps updateRequestStatus
export async function toggleRequest(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: request } = await supabase
    .from("requests")
    .select("status")
    .eq("id", id)
    .single();

  if (!request) return { error: "Request not found" };

  const newStatus: RequestStatus =
    request.status === "completed" ? "open" : "completed";

  return updateRequestStatus(id, newStatus);
}

// ============================================================
// Comments
// ============================================================

export interface RequestComment {
  id: string;
  request_id: string;
  profile_id: string;
  message: string;
  created_at: string;
  profile?: { full_name: string } | null;
}

export async function getComments(requestId: string): Promise<RequestComment[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data } = await supabase
    .from("request_comments")
    .select("*, profile:profiles(full_name)")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  return (data as RequestComment[]) ?? [];
}

export async function addComment(requestId: string, message: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (!message.trim()) return { error: "Message is required" };

  const { error } = await supabase.from("request_comments").insert({
    request_id: requestId,
    profile_id: user.id,
    message: message.trim(),
  });

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
