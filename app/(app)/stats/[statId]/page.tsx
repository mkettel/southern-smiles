import { getStatHistory } from "@/actions/stat-entries";
import { createClient } from "@/lib/supabase/server";
import { StatDetailView } from "@/components/stats/stat-detail-view";
import type { Stat, OicLogEntry } from "@/lib/types";

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

  const typedStat = stat as Stat;
  const divisionLabel =
    typedStat.post?.division
      ? `Div ${typedStat.post.division.number} - ${typedStat.post.division.name}`
      : "";

  // Fetch stat history and relevant OIC entries in parallel
  const [entries, oicEntries] = await Promise.all([
    getStatHistory(statId),
    getRelevantOicEntries(supabase, typedStat),
  ]);

  return (
    <StatDetailView
      statName={stat.name}
      statType={stat.stat_type}
      statDescription={stat.description}
      goodDirection={stat.good_direction}
      divisionLabel={divisionLabel}
      postTitle={typedStat.post?.title ?? ""}
      entries={entries}
      oicEntries={oicEntries}
    />
  );
}

/**
 * Get OIC log entries relevant to this stat:
 * - Entries tagged with the same division or post
 * - Entries tagged "Whole Practice" or with no area (general)
 */
async function getRelevantOicEntries(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  stat: Stat
): Promise<OicLogEntry[]> {
  const { data } = await supabase
    .from("oic_log")
    .select("*, profile:profiles(full_name)")
    .order("effective_date", { ascending: true });

  if (!data) return [];

  const divisionNumber = stat.post?.division?.number;
  const postTitle = stat.post?.title;

  return (data as OicLogEntry[]).filter((entry) => {
    const area = entry.area ?? "";
    const post = entry.post_affected ?? "";

    // Practice-wide entries
    if (area.includes("Whole Practice") || post.includes("Multiple/Other")) {
      return true;
    }

    // Same division
    if (divisionNumber && area.includes(`Div ${divisionNumber}`)) {
      return true;
    }

    // Same post
    if (postTitle && post === postTitle) {
      return true;
    }

    // No area tagged — treat as general
    if (!area && !post) {
      return true;
    }

    return false;
  });
}
