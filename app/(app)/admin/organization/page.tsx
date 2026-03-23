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

  const [divisions, posts] = await Promise.all([getDivisions(), getPosts()]);

  const supabase = await createClient();
  const postIds = (posts as Post[]).map((p) => p.id);
  const safePostIds = postIds.length > 0 ? postIds : [""];

  const [{ data: statData }, { data: assignData }] = await Promise.all([
    supabase
      .from("stats")
      .select("post_id, name")
      .in("post_id", safePostIds)
      .eq("is_active", true),
    supabase
      .from("employee_posts")
      .select("post_id, profile:profiles(full_name)")
      .in("post_id", safePostIds),
  ]);

  // Group stat names by post
  const statsByPost: Record<string, string[]> = {};
  statData?.forEach((s) => {
    if (!statsByPost[s.post_id]) statsByPost[s.post_id] = [];
    statsByPost[s.post_id].push(s.name);
  });

  // Group employee names by post
  const employeesByPost: Record<string, string[]> = {};
  assignData?.forEach((a) => {
    if (!employeesByPost[a.post_id]) employeesByPost[a.post_id] = [];
    const name = (a.profile as unknown as { full_name: string } | null)
      ?.full_name;
    if (name) employeesByPost[a.post_id].push(name);
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Organization</h1>
        <p className="text-muted-foreground">
          Manage divisions and posts. Rename, reorder, and delete divisions and
          posts.
        </p>
      </div>

      <OrgManager
        divisions={divisions as Division[]}
        posts={posts as Post[]}
        statsByPost={statsByPost}
        employeesByPost={employeesByPost}
      />
    </div>
  );
}
