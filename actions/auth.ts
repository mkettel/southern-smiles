"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeOrgSlug } from "@/lib/tenant";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const identifier = (formData.get("identifier") as string).trim();
  const password = formData.get("password") as string;
  const organization = normalizeOrgSlug(formData.get("organization") as string);

  let email = identifier;
  let practiceId: string | null = null;
  const admin = createAdminClient();

  if (!identifier) {
    return { error: "Username or email is required" };
  }

  if (!password) {
    return { error: "Password is required" };
  }

  if (formData.get("organization") && !organization) {
    return { error: "Enter a valid organization" };
  }

  if (organization) {
    const { data: practice } = await admin
      .from("practices")
      .select("id")
      .eq("slug", organization)
      .eq("is_active", true)
      .single();

    if (!practice) {
      return { error: "No organization found with that name" };
    }

    practiceId = practice.id;
  }

  // If the input doesn't look like an email, treat it as a username.
  // Use admin client to bypass RLS (user isn't authenticated yet).
  if (!identifier.includes("@")) {
    if (practiceId) {
      // Usernames are unique per practice, so a scoped lookup is unambiguous.
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("practice_id", practiceId)
        .ilike("username", identifier)
        .single();

      if (!profile) {
        return { error: "No account found for that organization" };
      }
      email = profile.email;
    } else {
      // No organization supplied: usernames are only unique per practice, so
      // fetch up to two matches and disambiguate rather than letting .single()
      // fail confusingly once a second practice reuses the same username.
      const { data: profiles } = await admin
        .from("profiles")
        .select("email")
        .ilike("username", identifier)
        .limit(2);

      if (!profiles || profiles.length === 0) {
        return { error: "No account found with that username" };
      }
      if (profiles.length > 1) {
        return {
          error:
            "That username exists in more than one practice. Please sign in from your practice's login page or use your email.",
        };
      }
      email = profiles[0].email;
    }
  } else if (practiceId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("practice_id", practiceId)
      .ilike("email", identifier)
      .single();

    if (!profile) {
      return { error: "No account found for that organization" };
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

export async function changePassword(input: {
  current_password: string;
  new_password: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) throw new Error("Unauthorized");

  const newPassword = input.new_password ?? "";
  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters" };
  }
  if (newPassword.length > 72) {
    return { error: "New password must be 72 characters or less" };
  }
  if (input.current_password === newPassword) {
    return { error: "New password must be different from the current one" };
  }

  // Verify the current password by re-authenticating. signInWithPassword
  // refreshes the session cookie, so the user stays signed in either way.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: input.current_password,
  });
  if (verifyError) {
    return { error: "Current password is incorrect" };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) return { error: updateError.message };

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
