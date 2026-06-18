import { redirect } from "next/navigation";

export default function LegacyEnterStatsPage() {
  redirect("/stats?mode=weekly");
}
