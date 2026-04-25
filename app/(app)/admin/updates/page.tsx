import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { listChangelog } from "@/actions/changelog";
import { ChangelogAdminList } from "@/components/changelog/changelog-admin-list";

export default async function AdminUpdatesPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const entries = await listChangelog();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Updates</h1>
        <p className="text-muted-foreground text-sm">
          Post changelog entries — visible to admins by default, or to everyone
          when you flip the toggle.
        </p>
      </div>
      <ChangelogAdminList entries={entries} />
    </div>
  );
}
