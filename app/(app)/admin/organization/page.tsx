import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getDivisions, getPosts } from "@/actions/admin";
import { createClient } from "@/lib/supabase/server";
import { OrgManager } from "@/components/admin/org-manager";
import type { Division, Post } from "@/lib/types";

export default async function OrganizationPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const [divisions, posts] = await Promise.all([
    getDivisions(),
    getPosts(),
  ]);

  // Get stat counts and assignment counts per post
  const supabase = await createClient();
  const postIds = (posts as Post[]).map((p) => p.id);

  const [{ data: statData }, { data: assignData }] = await Promise.all([
    supabase
      .from("stats")
      .select("post_id")
      .in("post_id", postIds.length > 0 ? postIds : [""]),
    supabase
      .from("employee_posts")
      .select("post_id")
      .in("post_id", postIds.length > 0 ? postIds : [""]),
  ]);

  const statCounts: Record<string, number> = {};
  const assignmentCounts: Record<string, number> = {};

  statData?.forEach((s) => {
    statCounts[s.post_id] = (statCounts[s.post_id] ?? 0) + 1;
  });
  assignData?.forEach((a) => {
    assignmentCounts[a.post_id] = (assignmentCounts[a.post_id] ?? 0) + 1;
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Organization</h1>
        <p className="text-muted-foreground">
          Manage divisions and posts
        </p>
      </div>

      <OrgManager
        divisions={divisions as Division[]}
        posts={posts as Post[]}
        statCounts={statCounts}
        assignmentCounts={assignmentCounts}
      />
    </div>
  );
}
