import { getStatHistory } from "@/actions/stat-entries";
import { createClient } from "@/lib/supabase/server";
import { StatDetailView } from "@/components/stats/stat-detail-view";
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
    return (
      <div className="text-center py-12 text-muted-foreground">
        Stat not found.
      </div>
    );
  }

  const entries = await getStatHistory(statId);
  const typedStat = stat as Stat;

  const divisionLabel =
    typedStat.post?.division
      ? `Div ${typedStat.post.division.number} - ${typedStat.post.division.name}`
      : "";

  return (
    <StatDetailView
      statName={stat.name}
      statType={stat.stat_type}
      divisionLabel={divisionLabel}
      postTitle={typedStat.post?.title ?? ""}
      entries={entries}
    />
  );
}
