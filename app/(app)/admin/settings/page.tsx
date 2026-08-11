import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getPracticeSettings } from "@/actions/settings";
import { SettingsForm } from "@/components/admin/settings-form";
import { getWorkspaceAccess } from "@/actions/workspace-access";
import { getWorkspaceEntityLabel } from "@/lib/workspace-access";

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const [settings, access] = await Promise.all([
    getPracticeSettings(),
    getWorkspaceAccess(),
  ]);
  const organizationLabel = getWorkspaceEntityLabel(access);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your {organizationLabel.toLowerCase()} name, logo, branding, and contact information
        </p>
      </div>

      <SettingsForm settings={settings} organizationLabel={organizationLabel} />
    </div>
  );
}
