import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCampaignRecipients } from "@/actions/surveys";
import { getPracticeSettings } from "@/actions/settings";
import { toDataUrl } from "@/lib/images";
import { flyerConfigSchema } from "@/lib/validators";
import {
  FlyerDocument,
  type FlyerPageData,
} from "@/components/pdf/flyer-document";
import { DEFAULT_FLYER_CONFIG, type FlyerConfig, type SurveyQuestion } from "@/lib/types";

async function requireAdmin(supabase: SupabaseClient): Promise<Response | null> {
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
  return null;
}

async function renderFlyerPdf(
  supabase: SupabaseClient,
  campaignId: string,
  config: FlyerConfig,
  origin: string,
  preview: boolean,
  recipientId?: string | null
): Promise<Buffer | null> {
  const { data: campaign } = await supabase
    .from("survey_campaigns")
    .select("title, questions, credit_amount_cents")
    .eq("id", campaignId)
    .single();
  if (!campaign) return null;

  const [recipients, settings] = await Promise.all([
    getCampaignRecipients(campaignId),
    getPracticeSettings(),
  ]);

  let source = recipients;
  if (recipientId) {
    source = recipients.filter((r) => r.id === recipientId);
    if (source.length === 0) return null; // unknown recipient
  } else if (preview) {
    source = recipients.slice(0, 1);
  }
  let pages: FlyerPageData[];
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
        const url = `${origin}/survey/${r.code}`;
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

  const logoUrl =
    settings.logo_url && !settings.logo_url.toLowerCase().endsWith(".svg")
      ? settings.logo_url
      : null;
  const [logoDataUrl, backgroundDataUrl] = await Promise.all([
    toDataUrl(logoUrl),
    config.backgroundMode === "image"
      ? toDataUrl(config.backgroundUrl)
      : Promise.resolve(null),
  ]);

  const creditLabel = `$${Math.round((campaign.credit_amount_cents ?? 0) / 100)}`;
  const questions = config.includeQuestions
    ? ((campaign.questions as SurveyQuestion[]) ?? []).map((q) => ({ label: q.label }))
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
  return renderToBuffer(element as any);
}

function pdfResponse(buffer: Buffer, campaignId: string, preview: boolean) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="flyers-${campaignId.slice(0, 8)}.pdf"`,
    },
  });
}

/** GET → render from the SAVED config in the DB (used for direct links). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const { campaignId } = await params;
  const { searchParams } = new URL(request.url);
  const preview = searchParams.get("preview") === "1";
  const recipientId = searchParams.get("recipientId");
  const origin = new URL(request.url).origin;

  const { data: campaign } = await supabase
    .from("survey_campaigns")
    .select("flyer_config")
    .eq("id", campaignId)
    .single();
  if (!campaign) return new Response("Campaign not found", { status: 404 });

  const config: FlyerConfig = {
    ...DEFAULT_FLYER_CONFIG,
    ...((campaign.flyer_config as Partial<FlyerConfig>) ?? {}),
  };
  const buffer = await renderFlyerPdf(
    supabase,
    campaignId,
    config,
    origin,
    preview,
    recipientId
  );
  if (!buffer) return new Response("Campaign not found", { status: 404 });
  return pdfResponse(buffer, campaignId, preview);
}

/** POST → render from the config in the request body (live, unsaved preview
 *  and "generate" — so the PDF reflects the current editor state). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const { campaignId } = await params;
  const { searchParams } = new URL(request.url);
  const preview = searchParams.get("preview") === "1";
  const origin = new URL(request.url).origin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid body", { status: 400 });
  }
  const parsed = flyerConfigSchema.safeParse(body);
  if (!parsed.success) return new Response("Invalid config", { status: 400 });

  const config: FlyerConfig = {
    ...DEFAULT_FLYER_CONFIG,
    ...parsed.data,
    backgroundUrl: parsed.data.backgroundUrl ?? null,
  };
  const buffer = await renderFlyerPdf(supabase, campaignId, config, origin, preview, null);
  if (!buffer) return new Response("Campaign not found", { status: 404 });
  return pdfResponse(buffer, campaignId, preview);
}
