import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getPatientsFiltered, getCampaigns } from "@/actions/surveys";
import { Card, CardContent } from "@/components/ui/card";
import { ImportPatientsDialog } from "@/components/surveys/import-patients-dialog";
import { PatientsTable } from "@/components/surveys/patients-table";
import type { Profile } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const [patients, campaigns] = await Promise.all([
    getPatientsFiltered({}),
    getCampaigns(),
  ]);

  const totalValue = patients.reduce((s, p) => s + p.total_collected_cents, 0);
  // Recency is measured against the data's most recent visit, not today — so a
  // stale export doesn't make everyone look lapsed.
  const asOf =
    patients.reduce<string | null>(
      (max, p) => (p.last_seen && (!max || p.last_seen > max) ? p.last_seen : max),
      null
    ) ?? undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/surveys"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Patient Surveys
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Patients</h1>
            <p className="text-muted-foreground">
              Filter by value, recency, and visits, then enroll a segment into a
              campaign — so you mail the right people, not everyone.
            </p>
          </div>
          <ImportPatientsDialog />
        </div>
      </div>

      {patients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">No patients yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Import a CSV — a contact list or a revenue report — to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Patients</p>
                <p className="mt-1 text-2xl font-bold">{patients.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Total collected</p>
                <p className="mt-1 text-2xl font-bold">
                  ${Math.round(totalValue / 100).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Repeat patients</p>
                <p className="mt-1 text-2xl font-bold">
                  {patients.filter((p) => p.visit_count > 1).length}
                </p>
              </CardContent>
            </Card>
          </div>

          <PatientsTable patients={patients} campaigns={campaigns} asOf={asOf} />
        </>
      )}
    </div>
  );
}
