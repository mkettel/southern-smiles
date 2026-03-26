import { getProfile } from "@/actions/auth";
import { getEmployees, getPosts, getDivisions } from "@/actions/admin";
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
import { AddPostWizard } from "@/components/admin/add-post-wizard";
import { InviteEmployeeDialog } from "@/components/admin/invite-employee-dialog";
import { ArchiveEmployeeButton } from "@/components/admin/archive-employee-button";
import { Pencil, Plus, Mail } from "lucide-react";
import type { Profile, Post, Division } from "@/lib/types";

export default async function ManageEmployeesPage() {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const [{ profiles, assignments }, posts, divisions] = await Promise.all([
    getEmployees(),
    getPosts(),
    getDivisions(),
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manage Team</h1>
          <p className="text-muted-foreground">
            Add a new post with the wizard, assign employees to posts, edit names and roles, or activate/deactivate team members
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <InviteEmployeeDialog
            trigger={
              <span className="inline-flex items-center gap-1">
                <Mail className="h-4 w-4" />
                Invite Employee
              </span>
            }
          />
          <AddPostWizard
            divisions={divisions as Division[]}
            employees={profiles as Profile[]}
            trigger={
              <span className="inline-flex items-center gap-1">
                <Plus className="h-4 w-4" />
                Add Post
              </span>
            }
          />
        </div>
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
                      {emp.username && (
                        <span className="block text-xs text-muted-foreground font-normal">
                          @{emp.username}
                        </span>
                      )}
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
                      <div className="flex items-center justify-end gap-1">
                        <span className="relative group/edit">
                          <EmployeeEditDialog
                            profile={{
                              id: emp.id,
                              full_name: emp.full_name,
                              username: emp.username ?? null,
                              role: emp.role,
                              is_active: emp.is_active,
                            }}
                            trigger={
                              <Pencil className="h-3 w-3" />
                            }
                          />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-foreground text-background whitespace-nowrap opacity-0 group-hover/edit:opacity-100 transition-opacity pointer-events-none z-10">
                            Edit employee
                          </span>
                        </span>
                        <ArchiveEmployeeButton
                          profileId={emp.id}
                          isActive={emp.is_active}
                          fullName={emp.full_name}
                        />
                      </div>
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

    </div>
  );
}
