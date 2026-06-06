import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { ExportTool } from "@/components/admin/export-tool";

export default async function ExportPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Export & Analyze</h1>
        <p className="text-muted-foreground">
          Pull all stats over a date range as Markdown or CSV — then paste the
          Markdown into Claude or ChatGPT for analysis.
        </p>
      </div>

      <ExportTool />
    </div>
  );
}
