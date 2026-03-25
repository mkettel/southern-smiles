"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function signupPractice(input: {
  practiceName: string;
  fullName: string;
  email: string;
  password: string;
}) {
  const { practiceName, fullName, email, password } = input;

  // Validate inputs
  if (!practiceName.trim()) return { error: "Practice name is required" };
  if (!fullName.trim()) return { error: "Full name is required" };
  if (!email.trim()) return { error: "Email is required" };
  if (password.length < 6) return { error: "Password must be at least 6 characters" };

  const adminClient = createAdminClient();

  // Check if email is already registered
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const emailExists = existingUsers?.users?.some(
    (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
  );
  if (emailExists) {
    return { error: "An account with this email already exists" };
  }

  // 1. Create the practice
  const slug = practiceName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data: practice, error: practiceError } = await adminClient
    .from("practices")
    .insert({
      name: practiceName.trim(),
      short_name: practiceName.trim(),
      slug,
      primary_color: "#0a0a0a",
    })
    .select("id")
    .single();

  if (practiceError || !practice) {
    return { error: practiceError?.message ?? "Failed to create practice" };
  }

  // 2. Create the auth user with practice metadata
  const { data: authUser, error: authError } =
    await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName.trim(),
        role: "admin",
        practice_id: practice.id,
      },
    });

  if (authError || !authUser?.user) {
    // Rollback: delete the practice
    await adminClient.from("practices").delete().eq("id", practice.id);
    return { error: authError?.message ?? "Failed to create account" };
  }

  // 3. Sign in the new user
  const supabase = await createClient();
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (loginError) {
    return { error: "Account created but login failed. Please sign in manually." };
  }

  redirect("/dashboard");
}
