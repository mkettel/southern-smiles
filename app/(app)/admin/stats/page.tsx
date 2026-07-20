import { getProfile } from "@/actions/auth";
import { getStats, getPosts } from "@/actions/admin";
import { redirect } from "next/navigation";
import { StatFormDialog } from "@/components/admin/stat-form-dialog";
import { StatsSetupWorkspace } from "@/components/admin/stats-setup-workspace";
import { Plus } from "lucide-react";
import type { Profile, Post, Stat } from "@/lib/types";

export default async function ManageStatsPage() {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const [stats, posts] = await Promise.all([getStats(), getPosts()]);
  const postsTyped = posts as Post[];
  const statsTyped = stats as Stat[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stats Setup</h1>
          <p className="text-muted-foreground">
            Add new stats to a post, edit stat names and types, set descriptions for employees, or deactivate stats you no longer need
          </p>
        </div>
        <StatFormDialog
          posts={postsTyped}
          trigger={
            <span className="inline-flex items-center gap-1">
              <Plus className="h-4 w-4" />
              Add Stat
            </span>
          }
        />
      </div>

      {statsTyped.length === 0 ? (
        <div className="rounded-md border py-10 text-center text-sm text-muted-foreground">
          No stats defined yet. Click Add Stat to create one.
        </div>
      ) : (
        <StatsSetupWorkspace stats={statsTyped} posts={postsTyped} />
      )}
    </div>
  );
}
