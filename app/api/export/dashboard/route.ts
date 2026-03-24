import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWeekStart, formatWeekLabel } from "@/lib/constants";
import { getAdminDashboard, getMissingSubmissions } from "@/actions/dashboard";
import { getOicEntries } from "@/actions/oic-log";
import { WeeklyReport } from "@/components/pdf/weekly-report";
import { format } from "date-fns";

export async function GET(request: Request) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Admin check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return new Response("Admin access required", { status: 403 });
  }

  // Get week parameter
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("week") ?? getCurrentWeekStart();
  const weekLabel = formatWeekLabel(weekStart);

  // Fetch all data in parallel
  const [stats, missing, oicEntries] = await Promise.all([
    getAdminDashboard(weekStart),
    getMissingSubmissions(weekStart),
    getOicEntries(),
  ]);

  // Filter OIC entries to the selected week (approximately)
  const weekDate = new Date(weekStart + "T00:00:00");
  const weekEnd = new Date(weekDate);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekOicEntries = oicEntries.filter((entry) => {
    const entryDate = new Date(entry.effective_date + "T00:00:00");
    return entryDate >= weekDate && entryDate <= weekEnd;
  });

  const generatedAt = format(new Date(), "MMM d, yyyy 'at' h:mm a");

  // Render PDF
  const element = React.createElement(WeeklyReport, {
    weekLabel,
    generatedAt,
    stats,
    missing,
    oicEntries: weekOicEntries,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  // Return as downloadable PDF
  const filename = `southern-smiles-report-${weekStart}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
