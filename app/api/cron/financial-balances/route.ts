import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncFinancialConnection } from "@/lib/financial-sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(authorization.slice(7), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: connections, error } = await supabase
    .from("financial_connections")
    .select("id, practice_id")
    .in("status", ["active", "error"]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let synced = 0;
  let failed = 0;
  for (const connection of connections ?? []) {
    try {
      await syncFinancialConnection({
        supabase,
        connectionId: connection.id as string,
        practiceId: connection.practice_id as string,
        actorId: null,
      });
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({ checked: connections?.length ?? 0, synced, failed });
}

