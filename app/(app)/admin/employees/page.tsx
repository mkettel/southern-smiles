import { getProfile } from "@/actions/auth";
import { getEmployees, getPosts } from "@/actions/admin";
import { redirect } from "next/navigation";
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
import { EmployeeEditDialog } from "@/components/admin/employee-edit-dialog";
import { PostAssignmentManager } from "@/components/admin/post-assignment-manager";
import { Pencil } from "lucide-react";
import type { Profile, Post } from "@/lib/types";

export default async function ManageEmployeesPage() {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const [{ profiles, assignments }, posts] = await Promise.all([
    getEmployees(),
    getPosts(),
  ]);

  // Group assignments by employee
  const assignmentsByEmployee = new Map<
    string,
    typeof assignments
  >();
  assignments.forEach((a) => {
    const list = assignmentsByEmployee.get(a.profile_id) ?? [];
    list.push(a);
    assignmentsByEmployee.set(a.profile_id, list);
  });

  const postsTyped = posts as Post[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manage Team</h1>
        <p className="text-muted-foreground">
          Edit employees, change roles, and manage post assignments
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Employees ({profiles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned Posts</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((emp) => {
                const empAssignments =
                  assignmentsByEmployee.get(emp.id) ?? [];
                return (
                  <TableRow
                    key={emp.id}
                    className={!emp.is_active ? "opacity-50" : ""}
                  >
                    <TableCell className="font-medium">
                      {emp.full_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {emp.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          emp.role === "admin" ? "default" : "secondary"
                        }
                      >
                        {emp.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={emp.is_active ? "default" : "secondary"}
                      >
                        {emp.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <PostAssignmentManager
                        profileId={emp.id}
                        assignments={empAssignments.map((a: { id: string; post_id: string; post?: { id: string; title: string; division?: { number: number; name: string } } }) => ({
                          id: a.id,
                          post_id: a.post_id,
                          post: a.post,
                        }))}
                        allPosts={postsTyped.map((p) => ({
                          id: p.id,
                          title: p.title,
                          division: p.division,
                        }))}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <EmployeeEditDialog
                        profile={{
                          id: emp.id,
                          full_name: emp.full_name,
                          role: emp.role,
                          is_active: emp.is_active,
                        }}
                        trigger={
                          <Pencil className="h-3 w-3" />
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {profiles.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No employees found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            To add a new employee, create their account in the{" "}
            <a
              href={`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '')}/auth/users`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2"
            >
              Supabase dashboard
            </a>{" "}
            (Authentication &gt; Users), then their profile will appear here automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
