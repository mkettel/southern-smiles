import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getOicEntries } from "@/actions/oic-log";
import { getDivisions, getPosts } from "@/actions/admin";
import { OicEntryForm } from "@/components/oic/oic-entry-form";
import { OicEntryCard } from "@/components/oic/oic-entry-card";
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
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">OIC Log</h1>
        <p className="text-muted-foreground">
          Track operational changes and initiatives
        </p>
      </div>

      <OicEntryForm
        divisions={divisions as Division[]}
        posts={posts as Post[]}
      />

      <div className="space-y-3">
        {entries.map((entry) => (
          <OicEntryCard
            key={entry.id}
            entry={entry}
            isAdmin={isAdmin}
            divisions={divisions as Division[]}
            posts={posts as Post[]}
          />
        ))}
        {entries.length === 0 && (
          <p className="text-center py-8 text-muted-foreground">
            No log entries yet.
          </p>
        )}
      </div>
    </div>
  );
}
