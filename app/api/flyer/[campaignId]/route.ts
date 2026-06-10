// Flyer PDF generation. Renders the block document (lib/flyer/types.ts) to
// real HTML/CSS and prints it with headless Chrome — the same component the
// editor canvas uses, so the PDF matches the on-screen design exactly.

import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCampaignRecipients } from "@/actions/surveys";
import { getPracticeSettings } from "@/actions/settings";
import { flyerConfigSchema, flyerDocumentSchema } from "@/lib/validators";
import { buildFlyerHtml } from "@/lib/flyer/render-html";
import { htmlToPdf } from "@/lib/flyer/pdf";
import {
  ensureDocumentSafety,
  isFlyerDocument,
  legacyToDocument,
  type FlyerDocument,
  type FlyerRenderData,
} from "@/lib/flyer/types";
import {
  DEFAULT_FLYER_CONFIG,
  type FlyerConfig,
  type SurveyQuestion,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

interface CampaignRow {
  title: string;
  questions: SurveyQuestion[];
  credit_amount_cents: number | null;
  flyer_config: unknown;
}

async function loadCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<CampaignRow | null> {
  const { data } = await supabase
    .from("survey_campaigns")
    .select("title, questions, credit_amount_cents, flyer_config")
    .eq("id", campaignId)
    .single();
  return (data as CampaignRow | null) ?? null;
}

/** Saved flyer_config → v2 document (converting legacy configs on the fly). */
function toDocument(
  raw: unknown,
  campaign: CampaignRow,
  logoUrl: string | null
): FlyerDocument {
  const v2 = flyerDocumentSchema.safeParse(raw);
  if (v2.success) return ensureDocumentSafety(v2.data as FlyerDocument);

  const legacy: FlyerConfig = {
    ...DEFAULT_FLYER_CONFIG,
    ...(flyerConfigSchema.safeParse(raw ?? {}).data ?? {}),
  } as FlyerConfig;
  return ensureDocumentSafety(
    legacyToDocument(legacy, { logoUrl, questions: campaign.questions ?? [] })
  );
}

async function buildRenderData(
  campaign: CampaignRow,
  campaignId: string,
  origin: string,
  practiceName: string,
  preview: boolean,
  recipientId: string | null
): Promise<FlyerRenderData[] | null> {
  const creditLabel = `$${Math.round((campaign.credit_amount_cents ?? 0) / 100)}`;
  const recipients = await getCampaignRecipients(campaignId);

  let source = recipients;
  if (recipientId) {
    source = recipients.filter((r) => r.id === recipientId);
    if (source.length === 0) return null;
  } else if (preview) {
    source = recipients.slice(0, 1);
  }

  const makeQr = (url: string) =>
    QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: "M" });

  if (source.length === 0) {
    const url = `${origin}/survey/SAMPLE`;
    return [
      {
        firstName: "Jane",
        fullName: "Jane Sample",
        practiceName,
        creditLabel,
        surveyUrl: url.replace(/^https?:\/\//, ""),
        qrDataUrl: await makeQr(url),
      },
    ];
  }

  return Promise.all(
    source.map(async (r) => {
      const url = `${origin}/survey/${r.code}`;
      const first =
        r.patient?.first_name?.trim() ||
        r.patient?.full_name?.trim().split(/\s+/)[0] ||
        "there";
      return {
        firstName: first,
        fullName: r.patient?.full_name ?? "",
        practiceName,
        creditLabel,
        surveyUrl: url.replace(/^https?:\/\//, ""),
        qrDataUrl: await makeQr(url),
      };
    })
  );
}

function pdfResponse(buffer: Buffer, campaignId: string, preview: boolean) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="flyers-${campaignId.slice(0, 8)}.pdf"`,
    },
  });
}

async function render(
  request: Request,
  campaignId: string,
  documentOverride: FlyerDocument | null
): Promise<Response> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const { searchParams, origin } = new URL(request.url);
  const preview = searchParams.get("preview") === "1";
  const recipientId = searchParams.get("recipientId");

  const campaign = await loadCampaign(supabase, campaignId);
  if (!campaign) return new Response("Campaign not found", { status: 404 });

  const settings = await getPracticeSettings();
  const logoUrl =
    settings.logo_url && !settings.logo_url.toLowerCase().endsWith(".svg")
      ? settings.logo_url
      : null;

  const doc = documentOverride
    ? ensureDocumentSafety(documentOverride)
    : toDocument(campaign.flyer_config, campaign, logoUrl);

  const data = await buildRenderData(
    campaign,
    campaignId,
    origin,
    settings.name,
    preview,
    recipientId
  );
  if (!data) return new Response("Recipient not found", { status: 404 });

  const html = await buildFlyerHtml(doc, data);
  const pdf = await htmlToPdf(html);
  return pdfResponse(pdf, campaignId, preview);
}

/** GET → render from the SAVED config in the DB (used for direct links). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;
  return render(request, campaignId, null);
}

/** POST → render from the document in the request body (live, unsaved
 *  preview and "generate" — the PDF reflects the current editor state). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  let doc: FlyerDocument;
  if (isFlyerDocument(body)) {
    const parsed = flyerDocumentSchema.safeParse(body);
    if (!parsed.success) return new Response("Invalid document", { status: 400 });
    doc = parsed.data as FlyerDocument;
  } else {
    // Legacy editor payload — convert on the fly.
    const parsed = flyerConfigSchema.safeParse(body);
    if (!parsed.success) return new Response("Invalid config", { status: 400 });
    const legacy = {
      ...DEFAULT_FLYER_CONFIG,
      ...parsed.data,
      backgroundUrl: parsed.data.backgroundUrl ?? null,
    } as FlyerConfig;
    doc = legacyToDocument(legacy);
  }

  return render(request, campaignId, doc);
}
