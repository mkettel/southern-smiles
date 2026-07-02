import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { importCherryApprovalForPractice } from "@/lib/cherry-financing-sync";

const webhookSchema = z.object({
  practiceId: z.string().trim().min(1).optional(),
  messageId: z.string().trim().max(300).nullable().optional(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
  receivedAt: z.string().datetime().optional(),
});

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.CHERRY_EMAIL_WEBHOOK_SECRET),
  });
}

export async function POST(request: Request) {
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

  if (!suppliedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
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
  const practiceId =
    parsed.data.practiceId ?? (await getSinglePracticeId(supabase));
  if (!practiceId) {
    return NextResponse.json(
      { error: "practiceId is required when more than one practice exists" },
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

async function getSinglePracticeId(supabase: ReturnType<typeof createAdminClient>) {
  const { data } = await supabase
    .from("practices")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(2);

  if (!data || data.length !== 1) return null;
  return data[0].id as string;
}
