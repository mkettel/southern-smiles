import { getPublicSurveyView } from "@/lib/survey/public";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SurveyForm } from "./survey-form";
import { CheckCircle2, Clock, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const view = await getPublicSurveyView(code);

  if (view.status === "ok") {
    return (
      <SurveyForm
        code={code}
        patientFirstName={view.patientFirstName!}
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
