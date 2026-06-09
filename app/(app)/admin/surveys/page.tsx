import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getCampaigns, getCampaignStats, getPatients } from "@/actions/surveys";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportPatientsDialog } from "@/components/surveys/import-patients-dialog";
import { CreateCampaignDialog } from "@/components/surveys/create-campaign-dialog";
import { HowItWorks } from "@/components/surveys/how-it-works";
import type { CampaignStatus, Profile } from "@/lib/types";
import { Mailbox, Users, MessageSquare, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  closed: "bg-muted text-muted-foreground",
};

export default async function SurveysPage() {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const [campaigns, patients] = await Promise.all([getCampaigns(), getPatients()]);
  const stats = await Promise.all(campaigns.map((c) => getCampaignStats(c.id)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Patient Surveys</h1>
            <HowItWorks />
          </div>
          <p className="text-muted-foreground">
            Send personalized survey letters with a QR code, capture feedback, and
            see who your referrers and biggest fans are.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportPatientsDialog />
          <CreateCampaignDialog />
        </div>
      </div>

      <Link href="/admin/surveys/patients" className="block">
        <Card className="transition-colors hover:bg-muted/50">
          <CardContent className="flex items-center gap-3 py-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-semibold">{patients.length}</span> patient
              {patients.length === 1 ? "" : "s"} in your list
            </span>
            <span className="ml-auto flex items-center gap-1 text-sm text-primary">
              Filter &amp; segment <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </CardContent>
        </Card>
      </Link>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Mailbox className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No campaigns yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Import your patients, then create a campaign to generate a unique QR
              code per letter and start collecting feedback.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((c, i) => {
            const s = stats[i];
            return (
              <Link key={c.id} href={`/admin/surveys/${c.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{c.title}</CardTitle>
                      <Badge className={STATUS_BADGE[c.status]}>{c.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      {s?.sentCount ?? 0} sent
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4" />
                      {s?.responseCount ?? 0} responses
                      {s && s.sentCount > 0 && (
                        <span className="text-foreground">
                          ({Math.round(s.responseRate * 100)}%)
                        </span>
                      )}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-primary">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
