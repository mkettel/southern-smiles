import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getOicEntries } from "@/actions/oic-log";
import { getDivisions, getPosts } from "@/actions/admin";
import { OicEntryForm } from "@/components/oic/oic-entry-form";
import { OicLogViews } from "@/components/oic/oic-log-views";
import type { Division, Post } from "@/lib/types";

export default async function OicLogPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const [entries, divisions, posts] = await Promise.all([
    getOicEntries(),
    getDivisions(),
    getPosts(),
  ]);

  const isAdmin = profile.role === "admin";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">OIC Log</h1>
        <p className="text-muted-foreground">
          Log operational changes, new initiatives, and decisions. Everyone can add entries, admins can edit and delete
        </p>
      </div>

      <OicEntryForm
        divisions={divisions as Division[]}
        posts={posts as Post[]}
      />

      <OicLogViews
        entries={entries}
        isAdmin={isAdmin}
        divisions={divisions as Division[]}
        posts={posts as Post[]}
      />
    </div>
  );
}
