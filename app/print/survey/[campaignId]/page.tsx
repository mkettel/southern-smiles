import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import QRCode from "qrcode";
import { getProfile } from "@/actions/auth";
import { getCampaign, getCampaignRecipients } from "@/actions/surveys";
import { patientLabel } from "@/lib/survey/label";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SurveyPrintSheet({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) notFound();

  const recipients = await getCampaignRecipients(campaignId);

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  // Pre-render a QR SVG per recipient.
  const cards = await Promise.all(
    recipients.map(async (r) => {
      const url = `${origin}/survey/${r.code}`;
      const svg = await QRCode.toString(url, {
        type: "svg",
        margin: 1,
        width: 180,
        errorCorrectionLevel: "M",
      });
      return {
        id: r.id,
        name: r.patient ? patientLabel(r.patient) : "",
        code: r.code,
        url,
        svg,
      };
    })
  );

  return (
    <div className="mx-auto max-w-4xl p-6 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">{campaign.title} — QR sheet</h1>
          <p className="text-sm text-muted-foreground">
            {cards.length} code{cards.length === 1 ? "" : "s"}. Each QR is unique
            to one patient. Labels are anonymized ids — use the Mail merge tool
            to print name-addressed letters.
          </p>
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recipients yet. Enroll patients first.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.id}
              className="flex break-inside-avoid flex-col items-center gap-1 rounded-lg border p-3 text-center"
            >
              <div
                className="h-[140px] w-[140px]"
                dangerouslySetInnerHTML={{ __html: c.svg }}
              />
              <p className="text-sm font-medium">{c.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{c.code}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
