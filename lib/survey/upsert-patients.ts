import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeidentifiedPatient } from "@/lib/types";

/**
 * Upsert de-identified patient records into the patients table for a practice.
 * Matches existing patients by external_ref (preferred) else bridge_key, and
 * refreshes the value/recency/frequency metrics (the import is the
 * authoritative snapshot). No name/phone/email is ever read or written — the
 * browser already hashed identity into bridge_key before sending.
 *
 * The caller is responsible for auth (requireAdmin) and cache revalidation.
 */
export async function upsertDeidentifiedPatients(
  supabase: SupabaseClient,
  practiceId: string,
  records: DeidentifiedPatient[]
): Promise<{ inserted: number; updated: number } | { error: string }> {
  type ExistingPatient = {
    id: string;
    bridge_key: string | null;
    external_ref: string | null;
  };

  const { data: existing } = await supabase
    .from("patients")
    .select("id, bridge_key, external_ref")
    .eq("practice_id", practiceId);

  const byRef = new Map<string, ExistingPatient>();
  const byKey = new Map<string, ExistingPatient>();
  for (const e of (existing ?? []) as ExistingPatient[]) {
    if (e.external_ref) byRef.set(e.external_ref, e);
    if (e.bridge_key) byKey.set(e.bridge_key, e);
  }

  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];

  for (const r of records) {
    const match =
      (r.external_ref && byRef.get(r.external_ref)) ||
      byKey.get(r.bridge_key) ||
      null;

    const metrics = {
      bridge_key: r.bridge_key,
      external_ref: r.external_ref ?? match?.external_ref ?? null,
      total_collected_cents: r.total_collected_cents,
      visit_count: r.visit_count,
      first_seen: r.first_seen ?? null,
      last_seen: r.last_seen ?? null,
    };

    if (match) {
      updates.push({
        id: match.id,
        practice_id: practiceId,
        ...metrics,
        updated_at: new Date().toISOString(),
      });
    } else {
      inserts.push({ practice_id: practiceId, ...metrics });
    }
  }

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const slice = inserts.slice(i, i + CHUNK);
    const { error, count } = await supabase
      .from("patients")
      .insert(slice, { count: "exact" });
    if (error) return { error: error.message };
    inserted += count ?? slice.length;
  }

  let updated = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("patients")
      .upsert(slice, { onConflict: "id" });
    if (error) return { error: error.message };
    updated += slice.length;
  }

  return { inserted, updated };
}
