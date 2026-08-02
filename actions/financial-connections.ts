"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  calculateTotalCreditCardDebtCents,
  type FinancialAccount,
  type FinancialConnection,
  type FinancialConnectionsDashboardData,
} from "@/lib/financial-connections";
import {
  syncFinancialConnection,
  syncTotalCreditCardDebtStat,
} from "@/lib/financial-sync";
import {
  decryptFinancialToken,
  encryptFinancialToken,
} from "@/lib/financial-token-crypto";
import {
  createPlaidLinkToken,
  getPlaidApiErrorDetails,
  getPlaidClient,
  getPlaidEnvironment,
  isPlaidConfigured,
} from "@/lib/plaid-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

const connectionIdSchema = z.string().uuid();
const exchangeSchema = z.object({
  publicToken: z.string().trim().min(10).max(1000),
  institutionId: z.string().trim().max(300).nullable().optional(),
  institutionName: z.string().trim().max(300).nullable().optional(),
});
const accountToggleSchema = z.object({
  accountId: z.string().uuid(),
  included: z.boolean(),
});

function isSetupMissing(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return Boolean(
    error &&
      (message.includes("financial_connections") ||
        message.includes("financial_accounts") ||
        error.code === "PGRST204" ||
        error.code === "PGRST205"),
  );
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    throw new Error("Admin access required");
  }

  return {
    supabase: createAdminClient(),
    user,
    profile: profile as Profile,
    practiceId: profile.practice_id as string,
  };
}

export async function getFinancialConnectionsDashboardData(): Promise<
  FinancialConnectionsDashboardData | null
> {
  const { supabase, practiceId } = await requireAdmin();
  const { data: connections, error: connectionError } = await supabase
    .from("financial_connections")
    .select(
      "id, practice_id, provider, provider_item_id, institution_id, institution_name, status, consent_expiration_time, last_synced_at, last_error, created_at, updated_at",
    )
    .eq("practice_id", practiceId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: true });

  if (isSetupMissing(connectionError)) return null;
  if (connectionError) throw new Error(connectionError.message);

  const { data: accounts, error: accountError } = await supabase
    .from("financial_accounts")
    .select("*")
    .eq("practice_id", practiceId)
    .order("name", { ascending: true });
  if (accountError) throw new Error(accountError.message);

  const typedAccounts = (accounts ?? []) as FinancialAccount[];
  const typedConnections = (connections ?? []) as FinancialConnection[];
  const activeAccounts = typedAccounts.filter((account) => account.is_active);
  const lastSyncedAt = typedConnections
    .map((connection) => connection.last_synced_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    configured: isPlaidConfigured(),
    environment: getPlaidEnvironment(),
    connections: typedConnections.map((connection) => ({
      ...connection,
      accounts: activeAccounts.filter(
        (account) => account.connection_id === connection.id,
      ),
    })),
    totalDebtCents: calculateTotalCreditCardDebtCents(activeAccounts),
    includedAccountCount: activeAccounts.filter(
      (account) => account.included_in_total,
    ).length,
    lastSyncedAt,
  };
}

export async function createFinancialLinkToken() {
  const { user, practiceId } = await requireAdmin();
  if (!isPlaidConfigured()) return { error: "Plaid is not configured" };

  try {
    const linkToken = await createPlaidLinkToken({
      clientUserId: `${practiceId}:${user.id}`,
    });
    return { success: true, linkToken };
  } catch (error) {
    return { error: getPlaidApiErrorDetails(error).message };
  }
}

export async function createFinancialUpdateLinkToken(connectionId: string) {
  const parsedId = connectionIdSchema.safeParse(connectionId);
  if (!parsedId.success) return { error: "Invalid financial connection" };

  const { supabase, user, practiceId } = await requireAdmin();
  const { data: connection } = await supabase
    .from("financial_connections")
    .select("access_token_ciphertext")
    .eq("id", parsedId.data)
    .eq("practice_id", practiceId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (!connection) return { error: "Financial connection not found" };

  try {
    const linkToken = await createPlaidLinkToken({
      clientUserId: `${practiceId}:${user.id}`,
      accessToken: decryptFinancialToken(connection.access_token_ciphertext as string),
    });
    return { success: true, linkToken };
  } catch (error) {
    return { error: getPlaidApiErrorDetails(error).message };
  }
}

export async function exchangeFinancialPublicToken(input: unknown) {
  const parsed = exchangeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid Plaid response" };
  }

  const { supabase, user, practiceId } = await requireAdmin();
  if (!isPlaidConfigured()) return { error: "Plaid is not configured" };

  try {
    const exchange = await getPlaidClient().itemPublicTokenExchange({
      public_token: parsed.data.publicToken,
    });
    const now = new Date().toISOString();
    const { data: connection, error: connectionError } = await supabase
      .from("financial_connections")
      .upsert(
        {
          practice_id: practiceId,
          provider: "plaid",
          provider_item_id: exchange.data.item_id,
          access_token_ciphertext: encryptFinancialToken(
            exchange.data.access_token,
          ),
          institution_id: parsed.data.institutionId ?? null,
          institution_name: parsed.data.institutionName ?? null,
          status: "active",
          last_error: null,
          created_by: user.id,
          updated_at: now,
        },
        { onConflict: "practice_id,provider,provider_item_id" },
      )
      .select("id")
      .single();
    if (connectionError) throw new Error(connectionError.message);

    const sync = await syncFinancialConnection({
      supabase,
      connectionId: connection.id as string,
      practiceId,
      actorId: user.id,
    });
    revalidateFinancialPaths();
    return { success: true, ...sync };
  } catch (error) {
    return { error: getPlaidApiErrorDetails(error).message };
  }
}

export async function refreshFinancialConnection(connectionId: string) {
  const parsedId = connectionIdSchema.safeParse(connectionId);
  if (!parsedId.success) return { error: "Invalid financial connection" };
  const { supabase, user, practiceId } = await requireAdmin();

  try {
    const sync = await syncFinancialConnection({
      supabase,
      connectionId: parsedId.data,
      practiceId,
      actorId: user.id,
    });
    revalidateFinancialPaths();
    return { success: true, ...sync };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not refresh balances",
    };
  }
}

export async function completeFinancialReconnect(connectionId: string) {
  return refreshFinancialConnection(connectionId);
}

export async function setFinancialAccountIncluded(input: unknown) {
  const parsed = accountToggleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid credit card selection" };

  const { supabase, user, practiceId } = await requireAdmin();
  const { error } = await supabase
    .from("financial_accounts")
    .update({
      included_in_total: parsed.data.included,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.accountId)
    .eq("practice_id", practiceId)
    .eq("is_active", true);
  if (error) return { error: error.message };

  const totalDebtCents = await syncTotalCreditCardDebtStat(
    supabase,
    practiceId,
    user.id,
  );
  revalidateFinancialPaths();
  return { success: true, totalDebtCents };
}

export async function disconnectFinancialConnection(connectionId: string) {
  const parsedId = connectionIdSchema.safeParse(connectionId);
  if (!parsedId.success) return { error: "Invalid financial connection" };

  const { supabase, user, practiceId } = await requireAdmin();
  const { data: connection } = await supabase
    .from("financial_connections")
    .select("access_token_ciphertext")
    .eq("id", parsedId.data)
    .eq("practice_id", practiceId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (!connection) return { error: "Financial connection not found" };

  try {
    await getPlaidClient().itemRemove({
      access_token: decryptFinancialToken(connection.access_token_ciphertext as string),
    });
    const now = new Date().toISOString();
    const { error: connectionError } = await supabase
      .from("financial_connections")
      .update({
        status: "disconnected",
        access_token_ciphertext: encryptFinancialToken(`removed:${crypto.randomUUID()}`),
        last_error: null,
        updated_at: now,
      })
      .eq("id", parsedId.data)
      .eq("practice_id", practiceId);
    if (connectionError) throw new Error(connectionError.message);

    const { error: accountError } = await supabase
      .from("financial_accounts")
      .update({ is_active: false, updated_at: now })
      .eq("connection_id", parsedId.data)
      .eq("practice_id", practiceId);
    if (accountError) throw new Error(accountError.message);

    await syncTotalCreditCardDebtStat(supabase, practiceId, user.id);
    revalidateFinancialPaths();
    return { success: true };
  } catch (error) {
    return { error: getPlaidApiErrorDetails(error).message };
  }
}

function revalidateFinancialPaths() {
  revalidatePath("/admin/financial-connections");
  revalidatePath("/dashboard");
  revalidatePath("/stats");
  revalidatePath("/stats/[statId]", "page");
}

