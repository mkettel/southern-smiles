import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCareSnapshot } from "@/lib/care-call-sync";
import { importCareCallSnapshot } from "@/lib/care-call-import";
import { refreshSumOfWeeklyTotalDependents } from "@/lib/sum-weekly-stat-sync";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.VAULT_CARE_SYNC_SECRET;
  if (!secret || process.env.VAULT_CARE_SYNC_ENABLED !== "true")
    return Response.json({ error: "Integration disabled" }, { status: 503 });
  const timestamp = request.headers.get("x-vault-timestamp") ?? "";
  const signature = request.headers.get("x-vault-signature") ?? "";
  if (
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 300000 ||
    !/^\w{64}$/.test(signature)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 2048)
    return new Response(null, { status: 413 });
  const text = await request.text();
  if (text.length > 2048) return new Response(null, { status: 413 });
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${text}`)
    .digest("hex");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  let snapshot;
  try {
    snapshot = validateCareSnapshot(JSON.parse(text));
  } catch {
    return Response.json({ error: "Invalid snapshot" }, { status: 400 });
  }
  try {
    await importCareCallSnapshot(
      snapshot,
      async (snapshot) => {
        const { error } = await createAdminClient().rpc("manage_care_call_sync", {
          p_operation: "snapshot",
          p_date: snapshot.date,
          p_value: snapshot.count,
          p_revision: snapshot.revision,
        });
        if (error) throw error;
      },
      refreshSumOfWeeklyTotalDependents,
    );
  } catch {
    console.error("Care Calls aggregate or dependent total sync failed");
    return Response.json(
      { error: "Sync incomplete; requires retry/review" },
      { status: 503 },
    );
  }
  return Response.json({ ok: true });
}
