"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionDraftSchema } from "@/lib/action-log-suggestions";
import { sharedSuggestionSchema } from "@/lib/shared-action-suggestions";

async function context() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("Sign in to review suggestions.");
  const { data: profile, error } = await client
    .from("profiles")
    .select("practice_id, role, is_active")
    .eq("id", user.id)
    .single();
  if (
    error ||
    !profile?.is_active ||
    profile.role !== "admin" ||
    !profile.practice_id
  )
    throw new Error("Active practice administrator required.");
  return {
    db: createAdminClient(),
    actor: user.id,
    practice: profile.practice_id as string,
  };
}

export async function getActionSuggestions() {
  try {
    const { db, practice } = await context();
    const { data, error } = await db
      .from("oic_action_suggestions")
      .select(
        "id,draft,status,version,reviewed_at,reviewed_by,oic_entry_id,original_draft",
      )
      .eq("practice_id", practice)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error)
      return {
        error:
          "The suggestion inbox is unavailable. Your existing Action Log is unaffected.",
        items: [],
      };
    return { items: z.array(sharedSuggestionSchema).parse(data) };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to load suggestions",
      items: [],
    };
  }
}

const reviewItem = z.object({
  id: z.string().min(1).max(200),
  version: z.number().int().positive(),
});
const operationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("import"),
    items: z.array(actionDraftSchema).min(1).max(200),
  }),
  z.object({
    operation: z.literal("save"),
    items: z
      .array(reviewItem.extend({ draft: actionDraftSchema }))
      .min(1)
      .max(1),
  }),
  z.object({
    operation: z.enum(["accept", "dismiss", "restore"]),
    items: z.array(reviewItem).min(1).max(200),
  }),
]);

export async function changeActionSuggestions(input: unknown) {
  try {
    const { db, actor, practice } = await context();
    const parsed = operationSchema.safeParse(input);
    if (!parsed.success)
      return { error: "Check the action fields, dates, and source links." };
    if (JSON.stringify(parsed.data).length > 1_000_000)
      return { error: "Suggestion batch is too large." };
    const { data, error } = await db.rpc("manage_oic_action_suggestions", {
      p_practice_id: practice,
      p_actor_id: actor,
      p_operation: parsed.data.operation,
      p_items: parsed.data.items,
    });
    if (error)
      return {
        error:
          error.code === "P0001"
            ? error.message
            : "Could not save suggestions. Nothing in this batch was applied.",
      };
    revalidatePath("/oic-log");
    revalidatePath("/dashboard");
    return { changed: Number(data) };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to save suggestions",
    };
  }
}
