"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isGoogleConfigured,
  extractSpreadsheetId,
  listSheetTabs,
  fetchSheetValues,
  GoogleNotConfiguredError,
} from "@/lib/google/sheets";
import { aggregateRows } from "@/lib/survey/patient-import";
import { upsertAggregatedPatients } from "@/lib/survey/upsert-patients";
import { saveSheetSourceSchema } from "@/lib/validators";
import type { PatientSheetSource } from "@/lib/types";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, practice_id")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("Admin access required");
  return { supabase, user, practiceId: profile.practice_id as string };
}

function friendly(e: unknown): string {
  if (e instanceof GoogleNotConfiguredError)
    return "Google Sheets isn't configured on the server yet. Add the service-account credentials first.";
  return e instanceof Error ? e.message : "Something went wrong";
}

export async function getSheetSource(): Promise<{
  source: PatientSheetSource | null;
  googleConfigured: boolean;
}> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("patient_sheet_sources")
    .select("*")
    .maybeSingle();
  return {
    source: (data as PatientSheetSource) ?? null,
    googleConfigured: isGoogleConfigured(),
  };
}

/** Fetch tab names for the connect dialog's picker. */
export async function getSheetTabs(
  url: string
): Promise<{ tabs?: string[]; error?: string }> {
  await requireAdmin();
  const { spreadsheetId } = extractSpreadsheetId(url);
  if (!spreadsheetId) return { error: "That doesn't look like a Google Sheets link." };
  try {
    const tabs = await listSheetTabs(spreadsheetId);
    return { tabs: tabs.map((t) => t.title) };
  } catch (e) {
    return { error: friendly(e) };
  }
}

export async function saveSheetSource(input: {
  url: string;
  sheetTitle?: string | null;
}) {
  const { supabase, user, practiceId } = await requireAdmin();
  const parsed = saveSheetSourceSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  const { spreadsheetId } = extractSpreadsheetId(parsed.data.url);
  if (!spreadsheetId) return { error: "That doesn't look like a Google Sheets link." };

  // Validate access early so the user gets a clear error now, not at sync time.
  try {
    await listSheetTabs(spreadsheetId);
  } catch (e) {
    return { error: friendly(e) };
  }

  const { error } = await supabase.from("patient_sheet_sources").upsert(
    {
      practice_id: practiceId,
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: parsed.data.url,
      sheet_title: parsed.data.sheetTitle?.trim() || null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "practice_id" }
  );
  if (error) return { error: error.message };

  revalidatePath("/admin/surveys/patients");
  return { success: true };
}

/** Unlink the connected Google Sheet. Patient data already synced is kept. */
export async function disconnectSheetSource() {
  const { supabase, practiceId } = await requireAdmin();
  const { error } = await supabase
    .from("patient_sheet_sources")
    .delete()
    .eq("practice_id", practiceId);
  if (error) return { error: error.message };

  revalidatePath("/admin/surveys/patients");
  return { success: true };
}

export async function syncSheetNow() {
  const { supabase, practiceId } = await requireAdmin();

  const { data: source } = await supabase
    .from("patient_sheet_sources")
    .select("*")
    .maybeSingle<PatientSheetSource>();
  if (!source) return { error: "No Google Sheet connected yet." };

  try {
    const rows = await fetchSheetValues(source.spreadsheet_id, source.sheet_title);
    const { patients } = aggregateRows(rows);
    if (patients.length === 0) {
      await supabase
        .from("patient_sheet_sources")
        .update({
          last_synced_at: new Date().toISOString(),
          last_row_count: 0,
          last_status: "error",
          last_error: "No patients found in the sheet.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", source.id);
      return { error: "No patients found in the sheet. Check the tab/columns." };
    }

    const result = await upsertAggregatedPatients(supabase, practiceId, patients);
    if ("error" in result) throw new Error(result.error);

    await supabase
      .from("patient_sheet_sources")
      .update({
        last_synced_at: new Date().toISOString(),
        last_row_count: patients.length,
        last_status: "ok",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id);

    revalidatePath("/admin/surveys/patients");
    revalidatePath("/admin/surveys");
    return { success: true, ...result, rowCount: patients.length };
  } catch (e) {
    const msg = friendly(e);
    await supabase
      .from("patient_sheet_sources")
      .update({
        last_status: "error",
        last_error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id);
    return { error: msg };
  }
}
