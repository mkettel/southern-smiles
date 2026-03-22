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
import type { Profile } from "@/lib/types";

export default async function ManageEmployeesPage() {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const { profiles, assignments } = await getEmployees();

  // Group assignments by employee
  const assignmentsByEmployee = new Map<string, typeof assignments>();
  assignments.forEach((a) => {
    const list = assignmentsByEmployee.get(a.profile_id) ?? [];
    list.push(a);
    assignmentsByEmployee.set(a.profile_id, list);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manage Team</h1>
        <p className="text-muted-foreground">
          View employees and their post assignments
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
                <TableHead>Assigned Posts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((emp) => {
                const empAssignments =
                  assignmentsByEmployee.get(emp.id) ?? [];
                return (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">
                      {emp.full_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
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
                      <div className="flex flex-wrap gap-1">
                        {empAssignments.map((a: { id: string; post?: { title: string; division?: { name: string; number: number } } }) => (
                          <Badge key={a.id} variant="outline" className="text-xs">
                            {a.post?.division
                              ? `Div ${a.post.division.number}: `
                              : ""}
                            {a.post?.title}
                          </Badge>
                        ))}
                        {empAssignments.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            No posts assigned
                          </span>
                        )}
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
