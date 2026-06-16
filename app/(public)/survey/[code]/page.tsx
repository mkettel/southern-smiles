import { headers } from "next/headers";
import { getPublicSurveyView } from "@/lib/survey/public";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SurveyForm } from "./survey-form";
import { CheckCircle2, Clock, Search } from "lucide-react";

export const dynamic = "force-dynamic";

// Link scanners, email-security previewers, and crawlers hit the URL without
// a human ever looking — don't count those as "opens".
const BOT_UA =
  /bot|crawl|spider|slurp|preview|scan|monitor|fetch|facebookexternalhit|whatsapp|telegram|slack|discord|headless|lighthouse|curl|wget|python-requests|axios|node-fetch|google-?(safe|read)|outlook|bingpreview|skypeuripreview/i;

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ua = (await headers()).get("user-agent") ?? "";
  const isBot = ua === "" || BOT_UA.test(ua);
  const view = await getPublicSurveyView(code, { recordView: !isBot });

  if (view.status === "ok") {
    return (
      <SurveyForm
        code={code}
        questions={view.questions!}
        creditAmountCents={view.creditAmountCents!}
      />
    );
  }

  const states = {
    not_found: {
      icon: Search,
      title: "Survey not found",
      body: "This link doesn't match a survey. Please double-check the QR code or web address on your letter.",
    },
    closed: {
      icon: Clock,
      title: "This survey has closed",
      body: "Thank you for your interest! This survey is no longer accepting responses.",
    },
    already_responded: {
      icon: CheckCircle2,
      title: "You're all set",
      body: "Our records show this survey was already completed. Thank you so much for your feedback!",
    },
  } as const;

  const state = states[view.status];
  const Icon = state.icon;

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <Icon className="mb-2 h-10 w-10 text-muted-foreground" />
        <CardTitle>{state.title}</CardTitle>
      </CardHeader>
      <CardContent className="text-center text-muted-foreground">
        {state.body}
      </CardContent>
    </Card>
  );
}
