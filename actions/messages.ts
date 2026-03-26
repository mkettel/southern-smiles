"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentPracticeId } from "@/lib/practice";
import { messageSchema, channelSchema } from "@/lib/validators";
import type { Conversation, ConversationListItem, Message, Profile } from "@/lib/types";

// ============================================================
// Queries
// ============================================================

export async function getConversations(): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const practiceId = await getCurrentPracticeId(supabase);

  // Get all conversations the user belongs to
  const { data: memberRows } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("profile_id", user.id)
    .eq("practice_id", practiceId);

  if (!memberRows?.length) return [];

  const conversationIds = memberRows.map((r) => r.conversation_id);

  // Fetch conversations, members, last messages, and last_seen in parallel
  const [convResult, membersResult, messagesResult, lastSeenResult] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("*")
        .in("id", conversationIds)
        .order("updated_at", { ascending: false }),
      supabase
        .from("conversation_members")
        .select(
          "conversation_id, profile_id, profile:profiles(id, full_name, avatar_url, avatar_color)"
        )
        .in("conversation_id", conversationIds),
      supabase
        .from("messages")
        .select("*, sender:profiles(id, full_name)")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("conversation_last_seen")
        .select("conversation_id, seen_at")
        .eq("profile_id", user.id)
        .in("conversation_id", conversationIds),
    ]);

  const conversations = convResult.data;
  if (!conversations?.length) return [];

  // Build lookup maps
  const lastSeenMap = new Map(
    (lastSeenResult.data ?? []).map((r) => [r.conversation_id, r.seen_at])
  );

  const lastMessageMap = new Map<string, Message>();
  for (const msg of messagesResult.data ?? []) {
    if (!lastMessageMap.has(msg.conversation_id)) {
      lastMessageMap.set(msg.conversation_id, msg as Message);
    }
  }

  const membersMap = new Map<
    string,
    Array<{ conversation_id: string; profile_id: string; profile: Profile | null }>
  >();
  for (const m of membersResult.data ?? []) {
    const list = membersMap.get(m.conversation_id) ?? [];
    list.push(m as typeof m & { profile: Profile | null });
    membersMap.set(m.conversation_id, list);
  }

  // Count unread messages per conversation in parallel
  const unreadCounts = new Map<string, number>();
  const countPromises = conversationIds.map(async (convId) => {
    const seenAt = lastSeenMap.get(convId);
    let query = supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", convId);
    if (seenAt) {
      query = query.gt("created_at", seenAt);
    }
    const { count } = await query;
    unreadCounts.set(convId, count ?? 0);
  });
  await Promise.all(countPromises);

  // Build list items
  const items: ConversationListItem[] = [];
  for (const conv of conversations as Conversation[]) {
    const members = membersMap.get(conv.id) ?? [];
    const otherMember =
      conv.type === "dm"
        ? members.find((m) => m.profile_id !== user.id)?.profile ?? undefined
        : undefined;

    items.push({
      conversation: conv,
      otherMember: otherMember ?? undefined,
      lastMessage: lastMessageMap.get(conv.id) ?? null,
      unreadCount: unreadCounts.get(conv.id) ?? 0,
    });
  }

  return items;
}

export async function getMessages(
  conversationId: string,
  cursor?: string
): Promise<Message[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Validate cursor format if provided
  if (cursor && isNaN(new Date(cursor).getTime())) {
    return [];
  }

  let query = supabase
    .from("messages")
    .select("*, sender:profiles(id, full_name, avatar_url, avatar_color)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data } = await query;
  // Return in ascending order for display
  return ((data as Message[]) ?? []).reverse();
}

export async function getUnreadMessageCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const practiceId = await getCurrentPracticeId(supabase);

  const { data: memberRows } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("profile_id", user.id)
    .eq("practice_id", practiceId);

  if (!memberRows?.length) return 0;

  const conversationIds = memberRows.map((r) => r.conversation_id);

  const { data: lastSeenRows } = await supabase
    .from("conversation_last_seen")
    .select("conversation_id, seen_at")
    .eq("profile_id", user.id)
    .in("conversation_id", conversationIds);

  const lastSeenMap = new Map(
    (lastSeenRows ?? []).map((r) => [r.conversation_id, r.seen_at])
  );

  // For a small team app (~4 users, ~10 conversations), sequential counts are acceptable
  // but we parallelize them for efficiency
  const countPromises = conversationIds.map(async (convId) => {
    const seenAt = lastSeenMap.get(convId);
    let query = supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", convId);
    if (seenAt) {
      query = query.gt("created_at", seenAt);
    }
    const { count } = await query;
    return count ?? 0;
  });

  const counts = await Promise.all(countPromises);
  return counts.reduce((sum, c) => sum + c, 0);
}

export async function getPracticeMembers(): Promise<Profile[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const practiceId = await getCurrentPracticeId(supabase);

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .neq("id", user.id)
    .order("full_name");

  return (data as Profile[]) ?? [];
}

// ============================================================
// Mutations
// ============================================================

export async function sendMessage(
  conversationId: string,
  content: string,
  mentions: string[] = []
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = messageSchema.safeParse({ content, mentions });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid message" };
  }

  const practiceId = await getCurrentPracticeId(supabase);

  // Verify user is a member of this conversation
  const { data: membership } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", user.id)
    .single();

  if (!membership) return { error: "Not a member of this conversation" };

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      practice_id: practiceId,
      content: parsed.data.content.trim(),
      mentions: parsed.data.mentions,
    })
    .select("*, sender:profiles(id, full_name, avatar_url, avatar_color)")
    .single();

  if (error) return { error: error.message };
  return { success: true, message: data as Message };
}

export async function getOrCreateDM(otherProfileId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  if (otherProfileId === user.id) return { error: "Cannot DM yourself" };

  const practiceId = await getCurrentPracticeId(supabase);

  // Validate other user is in the same practice
  const { data: otherProfile } = await supabase
    .from("profiles")
    .select("id, practice_id")
    .eq("id", otherProfileId)
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .single();

  if (!otherProfile) return { error: "User not found" };

  // Sort profile IDs for the dm_pairs unique constraint
  const [profileA, profileB] =
    user.id < otherProfileId
      ? [user.id, otherProfileId]
      : [otherProfileId, user.id];

  // Check for existing DM via dm_pairs table
  const { data: existingPair } = await supabase
    .from("dm_pairs")
    .select("conversation_id")
    .eq("practice_id", practiceId)
    .eq("profile_a", profileA)
    .eq("profile_b", profileB)
    .single();

  if (existingPair) {
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", existingPair.conversation_id)
      .single();

    if (existingConv) {
      return { success: true, conversation: existingConv as Conversation };
    }
  }

  // Create new DM
  const { data: newConv, error: convError } = await supabase
    .from("conversations")
    .insert({
      practice_id: practiceId,
      type: "dm",
      name: null,
      created_by: user.id,
    })
    .select()
    .single();

  if (convError) return { error: convError.message };

  // Record the DM pair for uniqueness (unique constraint prevents races)
  const { error: pairError } = await supabase.from("dm_pairs").insert({
    conversation_id: newConv.id,
    practice_id: practiceId,
    profile_a: profileA,
    profile_b: profileB,
  });

  if (pairError) {
    // Unique constraint violation = another request created the DM first
    // Clean up the conversation we just made and return the existing one
    await supabase.from("conversations").delete().eq("id", newConv.id);

    const { data: racePair } = await supabase
      .from("dm_pairs")
      .select("conversation_id")
      .eq("practice_id", practiceId)
      .eq("profile_a", profileA)
      .eq("profile_b", profileB)
      .single();

    if (racePair) {
      const { data: raceConv } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", racePair.conversation_id)
        .single();
      if (raceConv) {
        return { success: true, conversation: raceConv as Conversation };
      }
    }
    return { error: "Failed to create conversation" };
  }

  // Add both members
  const { error: membersError } = await supabase
    .from("conversation_members")
    .insert([
      { conversation_id: newConv.id, profile_id: user.id, practice_id: practiceId },
      { conversation_id: newConv.id, profile_id: otherProfileId, practice_id: practiceId },
    ]);

  if (membersError) return { error: membersError.message };

  return { success: true, conversation: newConv as Conversation };
}

export async function createChannel(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const practiceId = await getCurrentPracticeId(supabase);

  // Admin check scoped to practice
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .eq("practice_id", practiceId)
    .single();
  if (profile?.role !== "admin") return { error: "Admin access required" };

  const parsed = channelSchema.safeParse({ name });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid channel name" };
  }

  // Create channel
  const { data: newConv, error: convError } = await supabase
    .from("conversations")
    .insert({
      practice_id: practiceId,
      type: "channel",
      name: parsed.data.name.trim(),
      created_by: user.id,
    })
    .select()
    .single();

  if (convError) return { error: convError.message };

  // Add all active practice members
  const { data: practiceMembers } = await supabase
    .from("profiles")
    .select("id")
    .eq("practice_id", practiceId)
    .eq("is_active", true);

  if (practiceMembers?.length) {
    const memberInserts = practiceMembers.map((p) => ({
      conversation_id: newConv.id,
      profile_id: p.id,
      practice_id: practiceId,
    }));

    await supabase.from("conversation_members").insert(memberInserts);
  }

  return { success: true, conversation: newConv as Conversation };
}

export async function renameChannel(conversationId: string, name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const practiceId = await getCurrentPracticeId(supabase);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .eq("practice_id", practiceId)
    .single();
  if (profile?.role !== "admin") return { error: "Admin access required" };

  const parsed = channelSchema.safeParse({ name });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid channel name" };
  }

  // Scope to channels in this practice only
  const { error } = await supabase
    .from("conversations")
    .update({ name: parsed.data.name.trim() })
    .eq("id", conversationId)
    .eq("type", "channel")
    .eq("practice_id", practiceId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function markConversationSeen(conversationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const practiceId = await getCurrentPracticeId(supabase);

  await supabase.from("conversation_last_seen").upsert(
    {
      conversation_id: conversationId,
      profile_id: user.id,
      practice_id: practiceId,
      seen_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,profile_id" }
  );
}
