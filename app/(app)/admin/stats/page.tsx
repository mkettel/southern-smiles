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
import { StatFormDialog } from "@/components/admin/stat-form-dialog";
import { StatToggleButton } from "@/components/admin/stat-toggle-button";
import { Plus, Pencil } from "lucide-react";
import type { Profile, Post } from "@/lib/types";

export default async function ManageStatsPage() {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const [stats, posts] = await Promise.all([getStats(), getPosts()]);
  const postsTyped = posts as Post[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manage Stats</h1>
          <p className="text-muted-foreground">
            Add, edit, or deactivate stat definitions
          </p>
        </div>
        <StatFormDialog
          posts={postsTyped}
          trigger={
            <span className="inline-flex items-center gap-1">
              <Plus className="h-4 w-4" />
              Add Stat
            </span>
          }
        />
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((stat) => (
                <TableRow
                  key={stat.id}
                  className={!stat.is_active ? "opacity-50" : ""}
                >
                  <TableCell className="font-medium">
                    {stat.name}
                    {stat.abbreviation && (
                      <span className="text-muted-foreground text-xs ml-1">
                        ({stat.abbreviation})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{stat.stat_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        stat.good_direction === "up" ? "default" : "secondary"
                      }
                    >
                      {stat.good_direction === "up"
                        ? "Higher is better"
                        : "Lower is better"}
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
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <StatFormDialog
                        posts={postsTyped}
                        editStat={{
                          id: stat.id,
                          name: stat.name,
                          abbreviation: stat.abbreviation,
                          stat_type: stat.stat_type,
                          good_direction: stat.good_direction,
                          post_id: stat.post_id,
                          display_order: stat.display_order,
                        }}
                        trigger={
                          <Pencil className="h-3 w-3" />
                        }
                      />
                      <StatToggleButton
                        statId={stat.id}
                        isActive={stat.is_active}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {stats.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    No stats defined yet. Click "Add Stat" to create one.
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
