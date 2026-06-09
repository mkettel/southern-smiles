import type { SupabaseClient } from "@supabase/supabase-js";
import type { AggregatedPatient } from "@/lib/types";

/**
 * Upsert aggregated patient records into the patients table for a practice.
 * Matches existing patients by external_ref (preferred) else name_key:
 * refreshes the value/recency/frequency metrics (the import is the
 * authoritative snapshot) and coalesces contact fields (never wipes them).
 *
 * Shared by the CSV-upload action and the Google Sheets sync. The caller is
 * responsible for auth (requireAdmin) and cache revalidation.
 */
export async function upsertAggregatedPatients(
  supabase: SupabaseClient,
  practiceId: string,
  records: AggregatedPatient[]
): Promise<{ inserted: number; updated: number } | { error: string }> {
  type ExistingPatient = {
    id: string;
    name_key: string | null;
    external_ref: string | null;
    email: string | null;
    phone: string | null;
    attributes: Record<string, unknown> | null;
  };

  const { data: existing } = await supabase
    .from("patients")
    .select("id, name_key, external_ref, email, phone, attributes")
    .eq("practice_id", practiceId);

  const byRef = new Map<string, ExistingPatient>();
  const byKey = new Map<string, ExistingPatient>();
  for (const e of (existing ?? []) as ExistingPatient[]) {
    if (e.external_ref) byRef.set(e.external_ref, e);
    if (e.name_key) byKey.set(e.name_key, e);
  }

  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];

  for (const r of records) {
    const match =
      (r.external_ref && byRef.get(r.external_ref)) || byKey.get(r.name_key) || null;

    const metrics = {
      full_name: r.full_name,
      first_name: r.first_name ?? null,
      name_key: r.name_key,
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
        email: r.email ?? match.email ?? null,
        phone: r.phone ?? match.phone ?? null,
        attributes: { ...(match.attributes ?? {}), ...r.attributes },
        updated_at: new Date().toISOString(),
      });
    } else {
      inserts.push({
        practice_id: practiceId,
        ...metrics,
        email: r.email ?? null,
        phone: r.phone ?? null,
        attributes: r.attributes ?? {},
      });
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
    const { error } = await supabase.from("patients").upsert(slice, { onConflict: "id" });
    if (error) return { error: error.message };
    updated += slice.length;
  }

  return { inserted, updated };
}
