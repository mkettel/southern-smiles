/**
 * One-off operational helper to "unsend" a survey campaign so already-sent
 * recipients can be removed before re-sending. No UI feature — run by hand.
 *
 * Usage:
 *   npx tsx scripts/unsend-campaign.ts                       # list campaigns (read-only)
 *   npx tsx scripts/unsend-campaign.ts <campaignId>          # dry-run: show what would change
 *   npx tsx scripts/unsend-campaign.ts <campaignId> --confirm  # perform the unsend
 *
 * "Unsend" = on every recipient of the campaign, clear sent_at, reset
 * credit_status to 'none', clear credit_amount_cents / credit_expires_at, and
 * set the campaign back to 'draft' (so its public survey links go inactive and
 * the enrollment UI lets you remove patients). It does NOT touch the
 * Personalized Outflow stat — see the note printed after a confirmed run.
 */
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: existsSync(".env.local") ? ".env.local" : ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const [campaignId, flag] = process.argv.slice(2);
const confirm = flag === "--confirm";

async function listCampaigns() {
  const { data: campaigns, error } = await supabase
    .from("survey_campaigns")
    .select("id, title, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  console.log(`\nConnected to: ${url}\n`);
  console.log("Campaigns:\n");
  for (const c of campaigns ?? []) {
    const { data: recips } = await supabase
      .from("survey_recipients")
      .select("sent_at, responded_at, credit_status")
      .eq("campaign_id", c.id);
    const total = recips?.length ?? 0;
    const sent = recips?.filter((r) => r.sent_at).length ?? 0;
    const responded = recips?.filter((r) => r.responded_at).length ?? 0;
    const promised =
      recips?.filter((r) => r.credit_status === "promised").length ?? 0;
    console.log(
      `  ${c.id}  [${c.status}]  "${c.title}"\n` +
        `      enrolled ${total} · sent ${sent} · responded ${responded} · credits promised ${promised}\n`
    );
  }
  console.log(
    "To unsend one:  npx tsx scripts/unsend-campaign.ts <campaignId> --confirm\n"
  );
}

async function unsend() {
  const { data: campaign, error: cErr } = await supabase
    .from("survey_campaigns")
    .select("id, title, status")
    .eq("id", campaignId)
    .single();
  if (cErr || !campaign) {
    console.error(`Campaign ${campaignId} not found: ${cErr?.message ?? ""}`);
    process.exit(1);
  }

  const { data: recips } = await supabase
    .from("survey_recipients")
    .select("id, sent_at, responded_at, credit_status")
    .eq("campaign_id", campaignId);
  const total = recips?.length ?? 0;
  const sent = recips?.filter((r) => r.sent_at).length ?? 0;
  const responded = recips?.filter((r) => r.responded_at).length ?? 0;
  const redeemed =
    recips?.filter((r) => r.credit_status === "redeemed").length ?? 0;

  console.log(`\nCampaign: "${campaign.title}" [${campaign.status}]`);
  console.log(
    `  enrolled ${total} · sent ${sent} · responded ${responded} · credits redeemed ${redeemed}`
  );

  if (redeemed > 0) {
    console.log(
      `\n  ⚠️  ${redeemed} recipient(s) have ALREADY REDEEMED their credit. ` +
        `Unsending resets credit status — review before proceeding.`
    );
  }
  if (responded > 0) {
    console.log(
      `\n  ⚠️  ${responded} recipient(s) have ALREADY RESPONDED. They keep their ` +
        `responses, but their survey link goes inactive while the campaign is a draft.`
    );
  }

  if (!confirm) {
    console.log(
      `\nDRY RUN — nothing changed. Re-run with --confirm to apply:\n` +
        `  npx tsx scripts/unsend-campaign.ts ${campaignId} --confirm\n`
    );
    return;
  }

  const nowIso = new Date().toISOString();
  const { error: rErr, count } = await supabase
    .from("survey_recipients")
    .update(
      {
        sent_at: null,
        credit_status: "none",
        credit_amount_cents: 0,
        credit_expires_at: null,
        updated_at: nowIso,
      },
      { count: "exact" }
    )
    .eq("campaign_id", campaignId);
  if (rErr) {
    console.error(`Failed to reset recipients: ${rErr.message}`);
    process.exit(1);
  }

  const { error: sErr } = await supabase
    .from("survey_campaigns")
    .update({ status: "draft", updated_at: nowIso })
    .eq("id", campaignId);
  if (sErr) {
    console.error(`Failed to set campaign to draft: ${sErr.message}`);
    process.exit(1);
  }

  console.log(
    `\n✅ Unsent. Reset ${count ?? total} recipient(s); campaign is now a draft.\n` +
      `   You can now remove patients in Manage enrollment, then "Mark sent" to re-send.\n` +
      `   NOTE: this did NOT adjust the Personalized Outflow stat — re-sending will\n` +
      `   add the remaining count again, so that week's PO may double-count. Tell me\n` +
      `   if you want that corrected.\n`
  );
}

(campaignId ? unsend() : listCampaigns()).catch((e) => {
  console.error(e);
  process.exit(1);
});
