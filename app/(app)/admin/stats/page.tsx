import { getProfile } from "@/actions/auth";
import { getStats, getPosts } from "@/actions/admin";
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

export default async function ManageStatsPage() {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const stats = await getStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manage Stats</h1>
        <p className="text-muted-foreground">
          Add, edit, or deactivate stat definitions
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Stats ({stats.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Post</TableHead>
                <TableHead>Division</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((stat) => (
                <TableRow key={stat.id}>
                  <TableCell className="font-medium">{stat.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{stat.stat_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        stat.good_direction === "up" ? "default" : "secondary"
                      }
                    >
                      {stat.good_direction === "up" ? "Higher is better" : "Lower is better"}
                    </Badge>
                  </TableCell>
                  <TableCell>{stat.post?.title}</TableCell>
                  <TableCell>
                    {stat.post?.division
                      ? `Div ${stat.post.division.number} - ${stat.post.division.name}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={stat.is_active ? "default" : "secondary"}>
                      {stat.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
