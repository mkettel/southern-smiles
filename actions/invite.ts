"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPracticeId } from "@/lib/practice";

export async function inviteEmployee(input: {
  email: string;
  fullName: string;
  role: "admin" | "employee";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Verify admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, practice_id")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Admin access required" };

  const practiceId = profile.practice_id;

  // Validate inputs
  if (!input.email.trim()) return { error: "Email is required" };
  if (!input.fullName.trim()) return { error: "Full name is required" };

  const adminClient = createAdminClient();

  // Check if user already exists in this practice
  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id, email")
    .eq("email", input.email.trim().toLowerCase())
    .eq("practice_id", practiceId)
    .single();

  if (existingProfile) {
    return { error: "This email is already part of your practice" };
  }

  // Invite the user via Supabase's built-in invite
  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(input.email.trim(), {
      data: {
        full_name: input.fullName.trim(),
        role: input.role,
        practice_id: practiceId,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL ? "" : "http://localhost:3000"}/api/auth/callback`,
    });

  if (inviteError) {
    // If user already exists in auth but not in this practice
    if (inviteError.message.includes("already been registered")) {
      return {
        error:
          "This email is already registered. They may need to be added to your practice manually.",
      };
    }
    return { error: inviteError.message };
  }

  revalidatePath("/admin/employees");
  revalidatePath("/team");
  return { success: true, email: input.email.trim() };
}
