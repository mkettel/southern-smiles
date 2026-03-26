"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadAvatar, removeAvatar, updateMyProfile } from "@/actions/auth";
import type { Profile } from "@/lib/types";
import { Camera, X } from "lucide-react";

const AVATAR_COLORS = [
  { value: "#6b7280", label: "Gray" },
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#0a0a0a", label: "Black" },
];

interface ProfileFormProps {
  profile: Profile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.full_name);
  const [username, setUsername] = useState(profile.username ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [avatarColor, setAvatarColor] = useState(profile.avatar_color ?? "#6b7280");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [imgError, setImgError] = useState(false);

  const displayName = name.trim() || profile.full_name;
  const names = (displayName || "").split(" ").filter(Boolean);
  const initials =
    names
      .map((n) => n[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  const hasPhoto = avatarUrl && !imgError;

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

  async function handleRemoveAvatar() {
    setRemoving(true);
    const result = await removeAvatar();
    if (result.error) {
      toast.error(result.error);
    } else {
      setAvatarUrl(null);
      toast.success("Avatar removed");
      router.refresh();
    }
    setRemoving(false);
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
      avatar_color: avatarColor,
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
    <div className="space-y-8">
      {/* Avatar section */}
      <div className="space-y-4">
        <Label>Avatar</Label>
        <div className="flex items-start gap-6">
          {/* Preview */}
          <div className="shrink-0">
            {hasPhoto ? (
              <Image
                src={avatarUrl!}
                alt={displayName}
                width={80}
                height={80}
                className="h-20 w-20 rounded-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <span
                className="flex h-20 w-20 items-center justify-center rounded-full text-xl font-semibold text-white"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="h-4 w-4 mr-1.5" />
                {uploading ? "Uploading..." : "Upload photo"}
              </Button>
              {hasPhoto && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveAvatar}
                  disabled={removing}
                >
                  <X className="h-4 w-4 mr-1.5" />
                  {removing ? "Removing..." : "Remove"}
                </Button>
              )}
            </div>

            {/* Color picker for initials */}
            {!hasPhoto && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Initials color</p>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      title={color.label}
                      onClick={() => setAvatarColor(color.value)}
                      className="h-7 w-7 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: color.value,
                        borderColor: avatarColor === color.value ? "var(--foreground)" : "transparent",
                        transform: avatarColor === color.value ? "scale(1.15)" : "scale(1)",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              PNG, JPG, or WebP. Max 4MB.
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleAvatarUpload}
        />
      </div>

      {/* Profile fields */}
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
