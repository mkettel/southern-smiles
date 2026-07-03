import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { importCherryApprovalForPractice } from "@/lib/cherry-financing-sync";

const webhookSchema = z.object({
  messageId: z.string().trim().min(1).max(300),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
  receivedAt: z.string().datetime().optional(),
});

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.CHERRY_EMAIL_WEBHOOK_SECRET),
    practiceConfigured: Boolean(process.env.CHERRY_EMAIL_WEBHOOK_PRACTICE_ID),
  });
}

export async function POST(request: Request) {
  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_WEBHOOK_BODY_BYTES
  ) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413 },
    );
  }

  const expectedSecret = process.env.CHERRY_EMAIL_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Cherry email webhook is not configured" },
      { status: 503 },
    );
  }

  const suppliedSecret =
    request.headers.get("x-cherry-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!suppliedSecret || !safeSecretEquals(suppliedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (Buffer.byteLength(rawText) > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413 },
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = webhookSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const practiceId = await getWebhookPracticeId(supabase);
  if (!practiceId) {
    return NextResponse.json(
      { error: "Cherry email webhook practice is not configured" },
      { status: 400 },
    );
  }

  try {
    const result = await importCherryApprovalForPractice({
      supabase,
      practiceId,
      importedBy: null,
      payload: {
        ...parsed.data,
        receivedAt: parsed.data.receivedAt ?? new Date().toISOString(),
      },
    });

    if (result.status === "ignored") {
      return NextResponse.json(
        { imported: false, reason: result.reason },
        { status: 422 },
      );
    }

    revalidatePath("/dashboard");
    revalidatePath("/stats");
    revalidatePath("/stats/[statId]", "page");
    revalidatePath("/admin/cherry-financing");

    return NextResponse.json({
      imported: true,
      approvalId: result.approval?.id,
      weekStart: result.weekStart,
      weeklyTotalCents: result.weeklyTotalCents,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not import Cherry approval",
      },
      { status: 500 },
    );
  }
}

function safeSecretEquals(suppliedSecret: string, expectedSecret: string) {
  const suppliedBuffer = Buffer.from(suppliedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);
  if (suppliedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function checkRateLimit(request: Request) {
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const key = forwardedFor || "unknown";
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_MAX_REQUESTS;
}

async function getWebhookPracticeId(
  supabase: ReturnType<typeof createAdminClient>,
) {
  const configuredPracticeId =
    process.env.CHERRY_EMAIL_WEBHOOK_PRACTICE_ID?.trim();
  if (configuredPracticeId) return configuredPracticeId;
  return getSinglePracticeId(supabase);
}

async function getSinglePracticeId(supabase: ReturnType<typeof createAdminClient>) {
  const { data } = await supabase
    .from("practices")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(2);

  if (!data || data.length !== 1) return null;
  return data[0].id as string;
}
