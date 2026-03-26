import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import type { Profile } from "@/lib/types";
import { ProfileForm } from "@/components/profile/profile-form";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect("/login");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">My Profile</h1>
      <ProfileForm profile={profile} />
    </div>
  );
}
