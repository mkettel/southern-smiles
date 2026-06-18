import { redirect } from "next/navigation";

export default function LegacyAdminDailyStatsPage() {
  redirect("/stats?mode=daily");
}
