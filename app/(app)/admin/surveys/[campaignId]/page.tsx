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
import { AddTestRecipientDialog } from "@/components/surveys/add-test-recipient-dialog";
import { RecipientsTable } from "@/components/surveys/recipients-table";
import { ReferralChart } from "@/components/surveys/referral-chart";
import { ResponseFeed } from "@/components/surveys/response-feed";
import { FlyerDesigner } from "@/components/surveys/flyer-designer";
import { getPracticeSettings } from "@/actions/settings";
import { isImageGenConfigured } from "@/lib/ai/image";
import {
  ensureDocumentSafety,
  legacyToDocument,
  type FlyerDocument,
} from "@/lib/flyer/types";
import { flyerConfigSchema, flyerDocumentSchema } from "@/lib/validators";
import { DEFAULT_FLYER_CONFIG, type FlyerConfig, type Profile } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

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

  const [stats, recipients, referrals, feed, quotes, allPatients, settings] =
    await Promise.all([
      getCampaignStats(campaignId),
      getCampaignRecipients(campaignId),
      getReferralAggregation(campaignId),
      getResponseFeed(campaignId),
      getPullQuotes(campaignId),
      getPatientsFiltered({}),
      getPracticeSettings(),
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

  // Flyer config: v2 block documents load directly; older fixed-template
  // configs are converted to an equivalent block layout on the fly.
  const rawFlyerConfig = (campaign as unknown as { flyer_config?: unknown })
    .flyer_config;
  const v2 = flyerDocumentSchema.safeParse(rawFlyerConfig);
  let flyerDocument: FlyerDocument;
  if (v2.success) {
    flyerDocument = ensureDocumentSafety(v2.data as FlyerDocument);
  } else {
    const legacy: FlyerConfig = {
      ...DEFAULT_FLYER_CONFIG,
      ...(flyerConfigSchema.safeParse(rawFlyerConfig ?? {}).data ?? {}),
    } as FlyerConfig;
    const logoUrl =
      settings.logo_url && !settings.logo_url.toLowerCase().endsWith(".svg")
        ? settings.logo_url
        : null;
    flyerDocument = ensureDocumentSafety(
      legacyToDocument(legacy, { logoUrl, questions: campaign.questions })
    );
  }
  const creditLabel = `$${Math.round((campaign.credit_amount_cents ?? 0) / 100)}`;
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
        <AddTestRecipientDialog campaignId={campaignId} />
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
            <CardTitle className="text-base">
              In patients’ words{quotes.length ? ` (${quotes.length})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {quotes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No written responses yet.
              </p>
            ) : (
              <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                {quotes.map((q, i) => (
                  <blockquote
                    key={i}
                    className="border-l-2 border-primary/40 pl-3 text-sm"
                  >
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {q.questionLabel}
                    </p>
                    <p className="mt-0.5 italic">“{q.text}”</p>
                    <footer className="mt-1 text-xs text-muted-foreground">
                      — {q.patientName}
                    </footer>
                  </blockquote>
                ))}
              </div>
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
          <FlyerDesigner
            campaignId={campaignId}
            initialDocument={flyerDocument}
            practiceName={settings.name}
            creditLabel={creditLabel}
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

      {/* Response feed — click a response to see the full Q&A */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Responses</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponseFeed
            responses={feed}
            questions={campaign.questions}
            campaignId={campaignId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
