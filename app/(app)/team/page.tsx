import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/actions/auth";
import { getMissingSubmissions } from "@/actions/dashboard";
import { getCurrentWeekStart, formatWeekLabel } from "@/lib/constants";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MissingSubmissions } from "@/components/dashboard/missing-submissions";
import type { Profile } from "@/lib/types";

export default async function TeamPage() {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const weekStart = getCurrentWeekStart();

  // Get all employees with their post assignments
  const { data: employees } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_active", true)
    .order("full_name");

  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("*, post:posts(*, division:divisions(*))")
    .order("post_id");

  const missing = await getMissingSubmissions(weekStart);

  // Group assignments by employee
  const employeeAssignments = new Map<string, typeof assignments>();
  assignments?.forEach((a) => {
    const list = employeeAssignments.get(a.profile_id) ?? [];
    list.push(a);
    employeeAssignments.set(a.profile_id, list);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-muted-foreground">
          Overview of all employees, their posts, and who still needs to submit stats for {formatWeekLabel(weekStart)}
        </p>
      </div>

      {missing.length > 0 && <MissingSubmissions missing={missing} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employees</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Posts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees?.map((emp) => {
                const empAssignments = employeeAssignments.get(emp.id) ?? [];
                return (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <Link
                        href={`/team/${emp.id}`}
                        className="font-medium hover:underline"
                      >
                        {emp.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {emp.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={emp.role === "admin" ? "default" : "secondary"}
                      >
                        {emp.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {empAssignments.map((a: { id: string; post?: { title: string; division?: { name: string; number: number } } }) => (
                          <Badge key={a.id} variant="outline" className="text-xs">
                            {a.post?.title}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
