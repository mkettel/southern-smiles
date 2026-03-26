"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const identifier = (formData.get("identifier") as string).trim();
  const password = formData.get("password") as string;

  let email = identifier;

  // If the input doesn't look like an email, treat it as a username.
  // Use admin client to bypass RLS (user isn't authenticated yet).
  if (!identifier.includes("@")) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .ilike("username", identifier)
      .single();

    if (!profile) {
      return { error: "No account found with that username" };
    }
    email = profile.email;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const file = formData.get("avatar") as File;
  if (!file || file.size === 0) return { error: "No file provided" };

  if (file.size > 4 * 1024 * 1024) {
    return { error: "Avatar is too large — must be under 4MB" };
  }

  const allowedMime = ["image/png", "image/jpeg", "image/webp"];
  if (!allowedMime.includes(file.type)) {
    return { error: "Avatar must be PNG, JPG, or WebP" };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const allowedExt = ["png", "jpg", "jpeg", "webp"];
  if (!allowedExt.includes(ext)) {
    return { error: "Avatar must be PNG, JPG, or WebP" };
  }

  const filename = `${user.id}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filename, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) return { error: uploadError.message };

  const { data: urlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(filename);

  const avatarUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updateError) return { error: updateError.message };

  revalidatePath("/", "layout");
  return { success: true, avatar_url: avatarUrl };
}

export async function removeAvatar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateMyProfile(input: {
  full_name?: string;
  username?: string | null;
  avatar_color?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const fullName = input.full_name?.trim();
  if (input.full_name !== undefined && !fullName) {
    return { error: "Name is required" };
  }
  if (fullName && fullName.length > 100) {
    return { error: "Name must be 100 characters or less" };
  }

  const usernameVal = input.username?.trim() || null;
  if (usernameVal) {
    if (usernameVal.length > 50) {
      return { error: "Username must be 50 characters or less" };
    }
    if (!/^[a-z0-9._-]+$/.test(usernameVal)) {
      return { error: "Username can only contain lowercase letters, numbers, dots, and dashes" };
    }
  }

  if (input.avatar_color !== undefined && input.avatar_color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(input.avatar_color)) {
      return { error: "Invalid color" };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      ...(fullName !== undefined && { full_name: fullName }),
      ...(input.username !== undefined && { username: usernameVal }),
      ...(input.avatar_color !== undefined && { avatar_color: input.avatar_color }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
