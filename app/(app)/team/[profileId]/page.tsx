import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/actions/auth";
import { redirect } from "next/navigation";
import { getCurrentWeekStart, formatWeekLabel } from "@/lib/constants";
import { ConditionDisplay } from "@/components/stats/condition-display";
import { formatStatValue, formatPercentChange } from "@/lib/utils";
import { format } from "date-fns";
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

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const currentProfile = (await getProfile()) as Profile;
  if (currentProfile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .single();

  if (!employee) {
    return <div className="text-center py-12 text-muted-foreground">Employee not found.</div>;
  }

  // Get their assignments + stats
  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("post_id")
    .eq("profile_id", profileId);

  const postIds = assignments?.map((a) => a.post_id) ?? [];

  const { data: stats } = await supabase
    .from("stats")
    .select("*, post:posts(*)")
    .in("post_id", postIds)
    .eq("is_active", true)
    .order("display_order");

  const statIds = stats?.map((s) => s.id) ?? [];

  // Get recent entries
  const { data: entries } = await supabase
    .from("stat_entries")
    .select("*, stat:stats(*)")
    .in("stat_id", statIds)
    .order("week_start", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{employee.full_name}</h1>
        <p className="text-muted-foreground">{employee.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Stat</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Condition</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries?.map((entry) => {
                const condition =
                  entry.final_condition ?? entry.auto_condition;
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {format(
                        new Date(entry.week_start + "T00:00:00"),
                        "MMM d"
                      )}
                    </TableCell>
                    <TableCell>{entry.stat?.name}</TableCell>
                    <TableCell className="font-medium">
                      {formatStatValue(
                        Number(entry.value),
                        entry.stat?.stat_type ?? "count"
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.percent_change !== null
                        ? formatPercentChange(Number(entry.percent_change))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {condition ? (
                        <ConditionDisplay condition={condition} size="sm" />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!entries || entries.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No entries yet.
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
