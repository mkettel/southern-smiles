import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import {
  getCampaign,
  getCampaignRecipients,
  getCampaignStats,
  getReferralAggregation,
  getResponseFeed,
  getPullQuotes,
  getPatientsFiltered,
} from "@/actions/surveys";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignActions } from "@/components/surveys/campaign-actions";
import { EnrollmentManager } from "@/components/surveys/enrollment-manager";
import { RecipientsTable } from "@/components/surveys/recipients-table";
import { ReferralChart } from "@/components/surveys/referral-chart";
import { FlyerEditor } from "@/components/surveys/flyer-editor";
import { isImageGenConfigured } from "@/lib/ai/image";
import { DEFAULT_FLYER_CONFIG, type FlyerConfig, type Profile } from "@/lib/types";
import { ArrowLeft, Quote } from "lucide-react";

export const dynamic = "force-dynamic";

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) notFound();

  const [stats, recipients, referrals, feed, quotes, allPatients] =
    await Promise.all([
      getCampaignStats(campaignId),
      getCampaignRecipients(campaignId),
      getReferralAggregation(campaignId),
      getResponseFeed(campaignId),
      getPullQuotes(campaignId),
      getPatientsFiltered({}),
    ]);

  const unsentCount = recipients.filter((r) => !r.sent_at).length;
  const enrolledPatientIds = recipients.map((r) => r.patient_id);
  const sentPatientIds = recipients
    .filter((r) => r.sent_at)
    .map((r) => r.patient_id);
  const patientsAsOf =
    allPatients.reduce<string | null>(
      (max, p) => (p.last_seen && (!max || p.last_seen > max) ? p.last_seen : max),
      null
    ) ?? undefined;

  const flyerConfig: FlyerConfig = {
    ...DEFAULT_FLYER_CONFIG,
    ...(((campaign as unknown as { flyer_config?: Partial<FlyerConfig> })
      .flyer_config) ?? {}),
  };
  const aiEnabled = isImageGenConfigured();

  const kpis = [
    { label: "Enrolled", value: stats?.recipientCount ?? 0 },
    { label: "Letters sent", value: stats?.sentCount ?? 0 },
    { label: "Responses", value: stats?.responseCount ?? 0 },
    {
      label: "Response rate",
      value: stats ? `${Math.round(stats.responseRate * 100)}%` : "0%",
    },
    {
      label: "Credit outstanding",
      value: dollars(stats?.creditOutstandingCents ?? 0),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/surveys"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All campaigns
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{campaign.title}</h1>
          <Badge className="capitalize">{campaign.status}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EnrollmentManager
          campaignId={campaignId}
          patients={allPatients}
          enrolledPatientIds={enrolledPatientIds}
          sentPatientIds={sentPatientIds}
          asOf={patientsAsOf}
        />
        <CampaignActions
          campaignId={campaignId}
          status={campaign.status}
          recipientCount={stats?.recipientCount ?? 0}
          unsentCount={unsentCount}
        />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Referral sources */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where patients come from</CardTitle>
          </CardHeader>
          <CardContent>
            <ReferralChart data={referrals} />
          </CardContent>
        </Card>

        {/* Pull quotes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">In patients’ words</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quotes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No written responses yet.
              </p>
            ) : (
              quotes.slice(0, 8).map((q, i) => (
                <blockquote
                  key={i}
                  className="rounded-lg border-l-2 border-primary/40 bg-muted/40 py-2 pl-3 pr-2 text-sm"
                >
                  <Quote className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
                  <p className="italic">“{q.text}”</p>
                  <footer className="mt-1 text-xs text-muted-foreground">
                    — {q.patientName}
                  </footer>
                </blockquote>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Flyer designer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flyer</CardTitle>
        </CardHeader>
        <CardContent>
          <FlyerEditor
            campaignId={campaignId}
            initialConfig={flyerConfig}
            aiEnabled={aiEnabled}
          />
        </CardContent>
      </Card>

      {/* Recipients + credit ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recipients & $50 credits</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipientsTable campaignId={campaignId} recipients={recipients} />
        </CardContent>
      </Card>

      {/* Response feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent responses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {feed.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No responses yet.
            </p>
          ) : (
            feed.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {r.patient?.full_name ?? "A patient"}
                </span>
                <span className="text-muted-foreground">
                  {r.referral_source ? `via ${r.referral_source} · ` : ""}
                  {new Date(r.submitted_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
