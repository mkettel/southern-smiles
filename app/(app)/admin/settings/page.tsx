import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getPracticeSettings } from "@/actions/settings";
import { SettingsForm } from "@/components/admin/settings-form";

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const settings = await getPracticeSettings();

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your practice name, logo, branding, and contact information
        </p>
      </div>

      <SettingsForm settings={settings} />
    </div>
  );
}
