"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadAvatar, updateMyProfile } from "@/actions/auth";
import type { Profile } from "@/lib/types";

interface ProfileFormProps {
  profile: Profile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.full_name);
  const [username, setUsername] = useState(profile.username ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(false);

  const names = (profile.full_name || "").split(" ").filter(Boolean);
  const initials =
    names
      .map((n) => n[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("avatar", file);

    const result = await uploadAvatar(formData);
    if (result.error) {
      toast.error(result.error);
    } else if (result.avatar_url) {
      setAvatarUrl(result.avatar_url);
      setImgError(false);
      toast.success("Avatar updated");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    const result = await updateMyProfile({
      full_name: name.trim(),
      username: username.trim() || null,
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Profile updated");
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="relative group shrink-0"
        >
          {avatarUrl && !imgError ? (
            <Image
              src={avatarUrl}
              alt={profile.full_name}
              width={72}
              height={72}
              className="h-18 w-18 rounded-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="flex h-18 w-18 items-center justify-center rounded-full bg-muted text-lg font-medium">
              {initials}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading ? "..." : "Edit"}
          </span>
        </button>
        <div>
          <p className="font-medium">{profile.full_name}</p>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleAvatarUpload}
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Full Name</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-username">Username</Label>
          <Input
            id="profile-username"
            value={username}
            onChange={(e) =>
              setUsername(
                e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "")
              )
            }
            placeholder="e.g. odalis"
          />
          <p className="text-xs text-muted-foreground">
            Used for login. Letters, numbers, dots, dashes only.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={profile.email} disabled />
          <p className="text-xs text-muted-foreground">
            Contact your admin to change your email.
          </p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
