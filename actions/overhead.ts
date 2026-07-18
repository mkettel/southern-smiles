"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildOverheadCategorySummaries,
  buildOverheadSummary,
  DEFAULT_OVERHEAD_CATEGORIES,
  DEFAULT_OVERHEAD_SETTINGS,
} from "@/lib/overhead";
import { parseOverheadCsv, validateParsedOverheadImport } from "@/lib/overhead-import";
import {
  overheadCategorySchema,
  overheadItemSchema,
  overheadSettingsSchema,
} from "@/lib/validators";
import type {
  OverheadCategory,
  OverheadCategorySummary,
  OverheadDashboardData,
  OverheadImportPreview,
  OverheadItem,
  OverheadSettings,
} from "@/lib/types";

function normalizeOverheadSettings(row: OverheadSettings): OverheadSettings {
  return {
    ...row,
    operatories_count: Number(row.operatories_count),
    days_per_week: Number(row.days_per_week),
    clinical_hours_per_day: Number(row.clinical_hours_per_day),
    weeks_per_month: Number(row.weeks_per_month),
    utilization_percent: Number(row.utilization_percent),
  };
}

function normalizeOverheadItem(row: OverheadItem): OverheadItem {
  return {
    ...row,
    monthly_cost_cents: Number(row.monthly_cost_cents),
    cost_type: row.cost_type === "variable" ? "variable" : "fixed",
  };
}

function isOverheadSetupMissing(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("could not find the table 'public.overhead_settings'") ||
    message.includes("could not find the table 'public.overhead_categories'") ||
    message.includes("could not find the table 'public.overhead_items'") ||
    message.includes('relation "overhead_settings" does not exist') ||
    message.includes('relation "overhead_categories" does not exist') ||
    message.includes('relation "overhead_items" does not exist')
  );
}

function buildFallbackOverheadDashboardData(practiceId: string): OverheadDashboardData {
  const settings = {
    ...DEFAULT_OVERHEAD_SETTINGS,
    practice_id: practiceId,
  };

  const categories = DEFAULT_OVERHEAD_CATEGORIES.map((category, index) => ({
    id: `preview-${index}`,
    practice_id: practiceId,
    name: category.name,
    description: category.description,
    display_order: index,
    is_active: true,
    created_at: "",
    updated_at: "",
    item_count: 0,
    total_monthly_cents: 0,
  }));

  return {
    settings,
    categories,
    items: [],
    summary: buildOverheadSummary(settings, []),
    setupRequired: true,
  };
}

function buildPreviewDashboardDataFromImport(
  practiceId: string,
  settings: OverheadSettings,
  parsed: ReturnType<typeof parseOverheadCsv>,
): OverheadDashboardData {
  const categories: OverheadCategorySummary[] = parsed.categories.map((category) => {
    const categoryItems = parsed.items.filter(
      (item) => item.category_name === category.name,
    );

    return {
      id: `preview-${category.display_order}`,
      practice_id: practiceId,
      name: category.name,
      description: category.notes[0] ?? null,
      display_order: category.display_order,
      is_active: true,
      created_at: "",
      updated_at: "",
      item_count: categoryItems.length,
      total_monthly_cents: categoryItems.reduce(
        (sum, item) => sum + item.monthly_cost_cents,
        0,
      ),
    };
  });

  const categoryIdByName = new Map(
    categories.map((category) => [category.name, category.id]),
  );

  const items: OverheadItem[] = parsed.items.map((item) => ({
    id: `preview-item-${item.display_order}`,
    practice_id: practiceId,
    category_id: categoryIdByName.get(item.category_name) ?? "preview-unknown",
    name: item.name,
    monthly_cost_cents: item.monthly_cost_cents,
    cost_type: "fixed",
    notes: item.notes,
    display_order: item.display_order,
    is_active: true,
    created_at: "",
    updated_at: "",
    category: categories.find((category) => category.name === item.category_name),
  }));

  return {
    settings,
    categories,
    items,
    summary: buildOverheadSummary(settings, items, new Set(categories.map((category) => category.id))),
    setupRequired: true,
  };
}

async function requireOverheadAccess() {
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

  if (profile?.role !== "admin" || !profile.practice_id) {
    throw new Error("Admin access required");
  }

  return {
    supabase: createAdminClient(),
    practiceId: profile.practice_id as string,
  };
}

async function ensureOverheadSettings(
  supabase: ReturnType<typeof createAdminClient>,
  practiceId: string,
): Promise<OverheadSettings> {
  const { data: existing } = await supabase
    .from("overhead_settings")
    .select("*")
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (existing) return normalizeOverheadSettings(existing as OverheadSettings);

  const { data, error } = await supabase
    .from("overhead_settings")
    .insert({
      practice_id: practiceId,
      operatories_count: DEFAULT_OVERHEAD_SETTINGS.operatories_count,
      days_per_week: DEFAULT_OVERHEAD_SETTINGS.days_per_week,
      clinical_hours_per_day: DEFAULT_OVERHEAD_SETTINGS.clinical_hours_per_day,
      weeks_per_month: DEFAULT_OVERHEAD_SETTINGS.weeks_per_month,
      utilization_percent: DEFAULT_OVERHEAD_SETTINGS.utilization_percent,
      notes: DEFAULT_OVERHEAD_SETTINGS.notes,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return normalizeOverheadSettings(data as OverheadSettings);
}

async function ensureDefaultOverheadCategories(
  supabase: ReturnType<typeof createAdminClient>,
  practiceId: string,
) {
  const { data: categories } = await supabase
    .from("overhead_categories")
    .select("id")
    .eq("practice_id", practiceId)
    .limit(1);

  if ((categories?.length ?? 0) > 0) return;

  const { error } = await supabase.from("overhead_categories").insert(
    DEFAULT_OVERHEAD_CATEGORIES.map((category, index) => ({
      practice_id: practiceId,
      name: category.name,
      description: category.description,
      display_order: index,
      is_active: true,
    })),
  );

  if (error) throw new Error(error.message);
}

function revalidateOverheadPaths() {
  revalidatePath("/admin/overhead");
  revalidatePath("/admin/procedures");
}

export async function getOverheadDashboardData(): Promise<OverheadDashboardData> {
  const { supabase, practiceId } = await requireOverheadAccess();
  try {
    const settings = await ensureOverheadSettings(supabase, practiceId);
    await ensureDefaultOverheadCategories(supabase, practiceId);

    const [{ data: categoriesData, error: categoriesError }, { data: itemsData, error: itemsError }] = await Promise.all([
      supabase
        .from("overhead_categories")
        .select("*")
        .eq("practice_id", practiceId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("overhead_items")
        .select("*, category:overhead_categories(*)")
        .eq("practice_id", practiceId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (isOverheadSetupMissing(categoriesError) || isOverheadSetupMissing(itemsError)) {
      return buildFallbackOverheadDashboardData(practiceId);
    }
    if (categoriesError) throw new Error(categoriesError.message);
    if (itemsError) throw new Error(itemsError.message);

    const categories = (categoriesData ?? []) as OverheadCategory[];
    const items = ((itemsData ?? []) as OverheadItem[]).map(normalizeOverheadItem);
    const activeCategoryIds = new Set(
      categories.filter((category) => category.is_active).map((category) => category.id),
    );

    return {
      settings,
      categories: buildOverheadCategorySummaries(categories, items),
      items,
      summary: buildOverheadSummary(settings, items, activeCategoryIds),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      isOverheadSetupMissing({ message: error.message })
    ) {
      return buildFallbackOverheadDashboardData(practiceId);
    }
    throw error;
  }
}

export async function updateOverheadSettings(input: {
  operatories_count: number;
  days_per_week: number;
  clinical_hours_per_day: number;
  weeks_per_month: number;
  utilization_percent: number;
  notes?: string | null;
}) {
  const { supabase, practiceId } = await requireOverheadAccess();
  const parsed = overheadSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase
    .from("overhead_settings")
    .upsert({
      practice_id: practiceId,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    }, { onConflict: "practice_id" });

  if (error) return { error: error.message };

  revalidateOverheadPaths();
  return { success: true };
}

export async function createOverheadCategory(input: {
  name: string;
  description?: string | null;
  display_order?: number;
  is_active?: boolean;
}) {
  const { supabase, practiceId } = await requireOverheadAccess();
  const parsed = overheadCategorySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("overhead_categories").insert({
    practice_id: practiceId,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidateOverheadPaths();
  return { success: true };
}

export async function updateOverheadCategory(
  id: string,
  input: {
    name: string;
    description?: string | null;
    display_order?: number;
    is_active?: boolean;
  },
) {
  const { supabase, practiceId } = await requireOverheadAccess();
  const parsed = overheadCategorySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase
    .from("overhead_categories")
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("practice_id", practiceId);

  if (error) return { error: error.message };

  revalidateOverheadPaths();
  return { success: true };
}

export async function createOverheadItem(input: {
  category_id: string;
  name: string;
  monthly_cost_cents: number;
  cost_type?: "fixed" | "variable";
  notes?: string | null;
  display_order?: number;
  is_active?: boolean;
}) {
  const { supabase, practiceId } = await requireOverheadAccess();
  const parsed = overheadItemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("overhead_items").insert({
    practice_id: practiceId,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidateOverheadPaths();
  return { success: true };
}

export async function updateOverheadItem(
  id: string,
  input: {
    category_id: string;
    name: string;
    monthly_cost_cents: number;
    cost_type?: "fixed" | "variable";
    notes?: string | null;
    display_order?: number;
    is_active?: boolean;
  },
) {
  const { supabase, practiceId } = await requireOverheadAccess();
  const parsed = overheadItemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase
    .from("overhead_items")
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("practice_id", practiceId);

  if (error) return { error: error.message };

  revalidateOverheadPaths();
  return { success: true };
}

export async function deleteOverheadItem(id: string) {
  const { supabase, practiceId } = await requireOverheadAccess();

  const { error } = await supabase
    .from("overhead_items")
    .delete()
    .eq("id", id)
    .eq("practice_id", practiceId);

  if (error) return { error: error.message };

  revalidateOverheadPaths();
  return { success: true };
}

export async function importOverheadCsv(formData: FormData): Promise<
  | { success: true; preview: OverheadImportPreview; imported: true }
  | { success: true; preview: OverheadImportPreview; imported: false; setupRequired: true; previewData: OverheadDashboardData }
  | { error: string }
> {
  const { supabase, practiceId } = await requireOverheadAccess();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Pick a CSV file to import" };
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { error: "Use a CSV export of the overhead sheet" };
  }

  const text = await file.text();
  const parsed = parseOverheadCsv(text, file.name);

  if (!parsed.categories.length || !parsed.items.length) {
    return { error: "I couldn't find overhead categories and line items in that CSV" };
  }

  // Validate the full parsed payload against the DB constraints BEFORE the
  // destructive delete below, so a bad row (duplicate/over-length category,
  // invalid cost) can't wipe the existing workspace and then fail on insert.
  const validationError = validateParsedOverheadImport(parsed);
  if (validationError) {
    return { error: validationError };
  }

  try {
    const settings = await ensureOverheadSettings(supabase, practiceId);
    await ensureDefaultOverheadCategories(supabase, practiceId);

    const { data: existingCategories, error: existingCategoriesError } = await supabase
      .from("overhead_categories")
      .select("id")
      .eq("practice_id", practiceId);

    if (isOverheadSetupMissing(existingCategoriesError)) {
      return {
        success: true,
        imported: false,
        setupRequired: true,
        preview: parsed.preview,
        previewData: buildPreviewDashboardDataFromImport(
          practiceId,
          normalizeOverheadSettings({
            ...DEFAULT_OVERHEAD_SETTINGS,
            practice_id: practiceId,
          }),
          parsed,
        ),
      };
    }
    if (existingCategoriesError) return { error: existingCategoriesError.message };

    if ((existingCategories ?? []).length > 0) {
      const { error: deleteError } = await supabase
        .from("overhead_categories")
        .delete()
        .eq("practice_id", practiceId);
      if (deleteError) return { error: deleteError.message };
    }

    const categoryInsertPayload = parsed.categories.map((category) => ({
      practice_id: practiceId,
      name: category.name,
      description: null,
      display_order: category.display_order,
      is_active: true,
    }));

    const { data: insertedCategories, error: insertCategoriesError } = await supabase
      .from("overhead_categories")
      .insert(categoryInsertPayload)
      .select("id, name");

    if (insertCategoriesError) return { error: insertCategoriesError.message };

    const categoryIdByName = new Map(
      (insertedCategories ?? []).map((category) => [category.name, category.id]),
    );

    const itemInsertPayload = parsed.items
      .map((item) => {
        const categoryId = categoryIdByName.get(item.category_name);
        if (!categoryId) return null;
        return {
          practice_id: practiceId,
          category_id: categoryId,
          name: item.name,
          monthly_cost_cents: item.monthly_cost_cents,
          cost_type: "fixed",
          notes: item.notes,
          display_order: item.display_order,
          is_active: true,
        };
      })
      .filter((payload): payload is NonNullable<typeof payload> => payload !== null);

    const { error: insertItemsError } = await supabase
      .from("overhead_items")
      .insert(itemInsertPayload);

    if (insertItemsError) return { error: insertItemsError.message };

    const importedNotes = parsed.preview.notes.length
      ? `${settings.notes ? `${settings.notes}\n\n` : ""}Imported from ${parsed.preview.file_name}. Notes: ${parsed.preview.notes.join(" || ")}`
      : settings.notes;

    await supabase
      .from("overhead_settings")
      .update({
        notes: importedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("practice_id", practiceId);

    revalidateOverheadPaths();
    return { success: true, imported: true, preview: parsed.preview };
  } catch (error) {
    if (error instanceof Error && isOverheadSetupMissing({ message: error.message })) {
      return {
        success: true,
        imported: false,
        setupRequired: true,
        preview: parsed.preview,
        previewData: buildPreviewDashboardDataFromImport(
          practiceId,
          normalizeOverheadSettings({
            ...DEFAULT_OVERHEAD_SETTINGS,
            practice_id: practiceId,
          }),
          parsed,
        ),
      };
    }
    return {
      error: error instanceof Error ? error.message : "Import failed",
    };
  }
}
