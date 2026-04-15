import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getDivisions, getPosts, getDepartments } from "@/actions/admin";
import { createClient } from "@/lib/supabase/server";
import { OrgViewer } from "@/components/admin/org/org-viewer";
import type { Division, Post, Department } from "@/lib/types";

export default async function OrganizationPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const [divisions, posts, departments] = await Promise.all([
    getDivisions(),
    getPosts(),
    getDepartments(),
  ]);

  const supabase = await createClient();
  const postIds = (posts as Post[]).map((p) => p.id);
  const safePostIds = postIds.length > 0 ? postIds : [""];

  const [{ data: statData }, { data: assignData }, { data: employeeList }] = await Promise.all([
    supabase
      .from("stats")
      .select("post_id, name")
      .in("post_id", safePostIds)
      .eq("is_active", true),
    supabase
      .from("employee_posts")
      .select("post_id, profile:profiles(full_name)")
      .in("post_id", safePostIds),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  const statsByPost: Record<string, string[]> = {};
  statData?.forEach((s) => {
    if (!statsByPost[s.post_id]) statsByPost[s.post_id] = [];
    statsByPost[s.post_id].push(s.name);
  });

  const employeesByPost: Record<string, string[]> = {};
  assignData?.forEach((a) => {
    if (!employeesByPost[a.post_id]) employeesByPost[a.post_id] = [];
    const name = (a.profile as unknown as { full_name: string } | null)?.full_name;
    if (name) employeesByPost[a.post_id].push(name);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organization</h1>
        <p className="text-muted-foreground">
          Manage your org structure: divisions, departments, sections, posts, and stats
        </p>
      </div>

      <OrgViewer
        isAdmin={true}
        divisions={divisions as Division[]}
        posts={posts as Post[]}
        departments={departments as Department[]}
        statsByPost={statsByPost}
        employeesByPost={employeesByPost}
        employees={employeeList ?? []}
        currentUserName={profile.full_name}
      />
    </div>
  );
}
