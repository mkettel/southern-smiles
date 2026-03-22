import { getStatHistory } from "@/actions/stat-entries";
import { createClient } from "@/lib/supabase/server";
import { StatHistoryChart } from "@/components/stats/stat-history-chart";
import { ConditionDisplay } from "@/components/stats/condition-display";
import { formatStatValue, formatPercentChange } from "@/lib/utils";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Stat } from "@/lib/types";

export default async function StatDetailPage({
  params,
}: {
  params: Promise<{ statId: string }>;
}) {
  const { statId } = await params;

  const supabase = await createClient();
  const { data: stat } = await supabase
    .from("stats")
    .select("*, post:posts(*, division:divisions(*))")
    .eq("id", statId)
    .single();

  if (!stat) {
    return <div className="text-center py-12 text-muted-foreground">Stat not found.</div>;
  }

  const entries = await getStatHistory(statId);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{stat.name}</h1>
        <p className="text-muted-foreground">
          {(stat as Stat).post?.division?.name
            ? `Div ${(stat as Stat).post!.division!.number} - ${(stat as Stat).post!.division!.name}`
            : ""}{" "}
          &middot; {(stat as Stat).post?.title}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length > 0 ? (
            <StatHistoryChart
              entries={entries}
              statType={stat.stat_type}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No data yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Condition</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const condition =
                  entry.final_condition ?? entry.auto_condition;
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {format(
                        new Date(entry.week_start + "T00:00:00"),
                        "MMM d, yyyy"
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatStatValue(Number(entry.value), stat.stat_type)}
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
              {entries.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
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
