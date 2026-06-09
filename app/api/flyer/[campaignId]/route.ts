import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { getCampaignRecipients } from "@/actions/surveys";
import { getPracticeSettings } from "@/actions/settings";
import { toDataUrl } from "@/lib/images";
import {
  FlyerDocument,
  type FlyerPageData,
} from "@/components/pdf/flyer-document";
import { DEFAULT_FLYER_CONFIG, type FlyerConfig, type SurveyQuestion } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin")
    return new Response("Admin access required", { status: 403 });

  const { campaignId } = await params;
  const { searchParams } = new URL(request.url);
  const preview = searchParams.get("preview") === "1";
  const origin = new URL(request.url).origin;

  const { data: campaign } = await supabase
    .from("survey_campaigns")
    .select("title, questions, credit_amount_cents, flyer_config")
    .eq("id", campaignId)
    .single();
  if (!campaign) return new Response("Campaign not found", { status: 404 });

  const [recipients, settings] = await Promise.all([
    getCampaignRecipients(campaignId),
    getPracticeSettings(),
  ]);

  const config: FlyerConfig = {
    ...DEFAULT_FLYER_CONFIG,
    ...((campaign.flyer_config as Partial<FlyerConfig>) ?? {}),
  };

  // Build the per-patient pages. In preview mode (or when nobody's enrolled
  // yet) render a single sample page so the editor always has something.
  let pages: FlyerPageData[];
  const source = preview ? recipients.slice(0, 1) : recipients;

  if (source.length === 0) {
    const url = `${origin}/survey/SAMPLE`;
    pages = [
      {
        firstName: "Jane",
        fullName: "Jane Sample",
        qrDataUrl: await QRCode.toDataURL(url, {
          margin: 1,
          width: 600,
          errorCorrectionLevel: "M",
        }),
        surveyUrl: url.replace(/^https?:\/\//, ""),
      },
    ];
  } else {
    pages = await Promise.all(
      source.map(async (r) => {
        const code = r.code;
        const url = `${origin}/survey/${code}`;
        const first =
          r.patient?.first_name?.trim() ||
          r.patient?.full_name?.trim().split(/\s+/)[0] ||
          "there";
        return {
          firstName: first,
          fullName: r.patient?.full_name ?? "",
          qrDataUrl: await QRCode.toDataURL(url, {
            margin: 1,
            width: 600,
            errorCorrectionLevel: "M",
          }),
          surveyUrl: url.replace(/^https?:\/\//, ""),
        };
      })
    );
  }

  // Logo (skip SVG — react-pdf Image only renders raster) and background.
  const logoUrl =
    settings.logo_url && !settings.logo_url.toLowerCase().endsWith(".svg")
      ? settings.logo_url
      : null;
  const [logoDataUrl, backgroundDataUrl] = await Promise.all([
    toDataUrl(logoUrl),
    config.backgroundMode === "image" ? toDataUrl(config.backgroundUrl) : Promise.resolve(null),
  ]);

  const creditLabel = `$${Math.round((campaign.credit_amount_cents ?? 0) / 100)}`;
  const questions = config.includeQuestions
    ? ((campaign.questions as SurveyQuestion[]) ?? []).map((q) => ({
        label: q.label,
      }))
    : [];

  const element = React.createElement(FlyerDocument, {
    practiceName: settings.name,
    logoDataUrl,
    backgroundDataUrl,
    config,
    creditLabel,
    questions,
    pages,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="flyers-${campaignId.slice(0, 8)}.pdf"`,
    },
  });
}
