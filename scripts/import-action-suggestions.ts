import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { actionDraftSchema } from "../lib/action-log-suggestions";

// This producer can import suggestions only. It cannot approve or post entries.
async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      practice: { type: "string" },
      actor: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  if (!values.file)
    throw new Error(
      "Usage: node --import tsx scripts/import-action-suggestions.ts --file <json> [--practice <uuid> --actor <admin-uuid> --apply]",
    );
  const raw = await readFile(values.file, "utf8");
  if (Buffer.byteLength(raw) > 1_000_000) throw new Error("File exceeds 1 MB");
  const items = z
    .array(actionDraftSchema)
    .min(1)
    .max(200)
    .parse(JSON.parse(raw));
  console.log(`Validated ${items.length} project suggestions.`);
  for (const item of items)
    console.log(`- ${item.title} (${item.effective_date || "date needed"})`);
  if (!values.apply) {
    console.log(
      "Dry run only. Add --apply with the practice and reviewing administrator IDs to import pending suggestions.",
    );
  } else {
    const practice = z.uuid().parse(values.practice);
    const actor = z.uuid().parse(values.actor);
    config({ path: ".env.local", quiet: true });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error("Server Supabase configuration is missing");
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.rpc("manage_oic_action_suggestions", {
      p_practice_id: practice,
      p_actor_id: actor,
      p_operation: "import",
      p_items: items,
    });
    if (error)
      throw new Error(
        `Import failed (${error.code}). No batch changes were applied.`,
      );
    console.log(
      `Imported ${data} pending suggestions. Duplicates were skipped. No Action Log entries were posted.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
});
