import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import type { Profile } from "@/lib/types";
import { ProfileForm } from "@/components/profile/profile-form";
import { ChangePasswordForm } from "@/components/profile/change-password-form";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect("/login");

  return (
    <div className="mx-auto max-w-lg space-y-10">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">My Profile</h1>
        <ProfileForm profile={profile} />
      </div>

      <div className="space-y-6 border-t pt-8">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Password</h2>
          <p className="text-sm text-muted-foreground">
            Change the password you use to sign in.
          </p>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
