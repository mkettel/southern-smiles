import { redirect } from "next/navigation";

export default function LegacyDailyStatsPage() {
  redirect("/stats?mode=daily");
}
