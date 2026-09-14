import { redirect } from "next/navigation";
import Link from "next/link";
import { getProfile } from "@/actions/auth";
import { getOicEntries } from "@/actions/oic-log";
import { getDivisions, getPosts } from "@/actions/admin";
import { OicEntryForm } from "@/components/oic/oic-entry-form";
import { OicLogViews } from "@/components/oic/oic-log-views";
import type { Division, Post } from "@/lib/types";
import { getActionSuggestions } from "@/actions/action-suggestions";
import { ActionSuggestionInbox } from "@/components/oic/action-suggestion-inbox";

export default async function OicLogPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const [entries, divisions, posts] = await Promise.all([
    getOicEntries(),
    getDivisions(),
    getPosts(),
  ]);

  const isAdmin = profile.role === "admin";
  const suggestions = isAdmin ? await getActionSuggestions() : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Action Log</h1>
        <p className="text-muted-foreground">
          Log operational changes, new initiatives, and decisions. Everyone can add entries, admins can edit and delete
        </p>
      </div>

      {process.env.NODE_ENV === "development" && isAdmin && (
        <Link className="text-sm underline underline-offset-4" href="/action-log-preview">
          Preview suggested actions
        </Link>
      )}

      <OicEntryForm
        divisions={divisions as Division[]}
        posts={posts as Post[]}
      />

      {suggestions && <ActionSuggestionInbox items={suggestions.items} error={suggestions.error} />}

      <OicLogViews
        entries={entries}
        isAdmin={isAdmin}
        divisions={divisions as Division[]}
        posts={posts as Post[]}
      />
    </div>
  );
}
