"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  Check,
  CreditCard,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Unlink,
  X,
} from "lucide-react";
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import { toast } from "sonner";
import {
  completeFinancialReconnect,
  createFinancialLinkToken,
  createFinancialUpdateLinkToken,
  disconnectFinancialConnection,
  exchangeFinancialPublicToken,
  refreshFinancialConnection,
  setFinancialAccountBookkeepingIncluded,
  setFinancialAccountIncluded,
  setFinancialAccountNickname,
} from "@/actions/financial-connections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  FinancialAccount,
  FinancialConnectionsDashboardData,
} from "@/lib/financial-connections";

interface LinkSession {
  token: string;
  mode: "connect" | "reconnect";
  connectionId?: string;
}

export function FinancialConnectionsDashboard({
  initialData,
}: {
  initialData: FinancialConnectionsDashboardData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [linkSession, setLinkSession] = useState<LinkSession | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const plaidConfig = useMemo(
    () => ({
      token: linkSession?.token ?? null,
      onSuccess: async (
        publicToken: string | null,
        metadata: PlaidLinkOnSuccessMetadata,
      ) => {
        const session = linkSession;
        setLinkSession(null);
        if (!session) return;

        setBusyId(session.connectionId ?? "connect");
        const result = session.mode === "reconnect" && session.connectionId
          ? await completeFinancialReconnect(session.connectionId)
          : publicToken
            ? await exchangeFinancialPublicToken({
                publicToken,
                institutionId: metadata.institution?.institution_id ?? null,
                institutionName: metadata.institution?.name ?? null,
              })
            : { error: "Plaid did not return a connection token" };
        setBusyId(null);

        if ("error" in result && result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(
          session.mode === "reconnect"
            ? "Connection access updated"
            : "Institution connected",
        );
        startTransition(() => router.refresh());
      },
      onExit: () => setLinkSession(null),
    }),
    [linkSession, router],
  );
  const { open, ready } = usePlaidLink(plaidConfig);

  useEffect(() => {
    if (linkSession && ready) open();
  }, [linkSession, open, ready]);

  async function beginConnect() {
    setBusyId("connect");
    const result = await createFinancialLinkToken();
    setBusyId(null);
    if (result.error || !result.linkToken) {
      toast.error(result.error ?? "Could not start Plaid Link");
      return;
    }
    setLinkSession({ token: result.linkToken, mode: "connect" });
  }

  async function beginReconnect(connectionId: string) {
    setBusyId(connectionId);
    const result = await createFinancialUpdateLinkToken(connectionId);
    setBusyId(null);
    if (result.error || !result.linkToken) {
      toast.error(result.error ?? "Could not reconnect this institution");
      return;
    }
    setLinkSession({
      token: result.linkToken,
      mode: "reconnect",
      connectionId,
    });
  }

  async function refresh(connectionId: string) {
    setBusyId(connectionId);
    const result = await refreshFinancialConnection(connectionId);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      startTransition(() => router.refresh());
      return;
    }
    toast.success("Balances refreshed");
    startTransition(() => router.refresh());
  }

  async function toggleAccount(accountId: string, included: boolean) {
    setBusyId(accountId);
    const result = await setFinancialAccountIncluded({ accountId, included });
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function toggleBookkeepingAccount(accountId: string, included: boolean) {
    setBusyId(accountId);
    const result = await setFinancialAccountBookkeepingIncluded({
      accountId,
      included,
    });
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(included ? "Account added to bookkeeping" : "Account removed from bookkeeping");
    startTransition(() => router.refresh());
  }

  async function renameAccount(accountId: string, nickname: string) {
    setBusyId(accountId);
    const result = await setFinancialAccountNickname({ accountId, nickname });
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    toast.success(result.nickname ? "Account name updated" : "Custom name removed");
    startTransition(() => router.refresh());
    return true;
  }

  async function disconnect(connectionId: string, institutionName: string) {
    if (
      !window.confirm(
        `Disconnect ${institutionName}? Its cards will stop contributing to the Owner debt stat.`,
      )
    ) {
      return;
    }
    setBusyId(connectionId);
    const result = await disconnectFinancialConnection(connectionId);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Institution disconnected");
    startTransition(() => router.refresh());
  }

  const disabled = isPending || busyId !== null;

  return (
    <div className="space-y-6">
      {initialData.environment === "sandbox" && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Plaid sandbox</p>
            <p className="text-amber-800 dark:text-amber-200">
              Test institutions and sample balances only. Production credentials
              are required before Capital One can be connected.
            </p>
          </div>
        </div>
      )}

      {!initialData.configured ? (
        <ConfigurationNotice />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Read-only balances and transaction activity
          </div>
          <Button onClick={beginConnect} disabled={disabled}>
            {busyId === "connect" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Connect institution
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total credit card debt"
          value={formatCurrency(initialData.totalDebtCents)}
          detail="Owner stat"
          icon={CreditCard}
        />
        <MetricCard
          label="Cards included"
          value={String(initialData.includedAccountCount)}
          detail="Active cards in total"
          icon={Building2}
        />
        <MetricCard
          label="Bookkeeping accounts"
          value={String(initialData.includedBookkeepingAccountCount)}
          detail="Included in transaction inbox"
          icon={ShieldCheck}
        />
        <MetricCard
          label="Last successful sync"
          value={initialData.lastSyncedAt ? formatShortDate(initialData.lastSyncedAt) : "Not yet"}
          detail="Plaid liabilities refresh"
          icon={RefreshCw}
        />
      </div>

      {initialData.connections.length === 0 ? (
        <div className="border-y py-12 text-center">
          <CreditCard className="mx-auto h-7 w-7 text-muted-foreground" />
          <h2 className="mt-3 font-medium">No institutions connected</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a credit-card institution to begin the Owner debt stat.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {initialData.connections.map((connection) => {
            const institutionName = connection.institution_name ?? "Financial institution";
            const needsReconnect = connection.status === "reconnect_required";
            const hasError = connection.status === "error";
            const needsTransactionConsent =
              connection.transactions_status === "not_enabled";

            return (
              <Card key={connection.id} className="overflow-hidden">
                <CardHeader className="border-b bg-muted/30 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{institutionName}</CardTitle>
                        <ConnectionStatus status={connection.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {connection.last_synced_at
                          ? `Synced ${formatLongDate(connection.last_synced_at)}`
                          : "Waiting for first sync"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {needsTransactionConsent && !needsReconnect && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => beginReconnect(connection.id)}
                          disabled={disabled}
                        >
                          {busyId === connection.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Link2 className="h-4 w-4" />
                          )}
                          Enable transactions
                        </Button>
                      )}
                      {needsReconnect ? (
                        <Button
                          size="sm"
                          onClick={() => beginReconnect(connection.id)}
                          disabled={disabled}
                        >
                          {busyId === connection.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Link2 className="h-4 w-4" />
                          )}
                          Reconnect
                        </Button>
                      ) : (
                        <Button
                          size="icon-sm"
                          variant="outline"
                          title="Refresh balances"
                          aria-label={`Refresh ${institutionName} balances`}
                          onClick={() => refresh(connection.id)}
                          disabled={disabled}
                        >
                          <RefreshCw
                            className={cn(
                              "h-4 w-4",
                              busyId === connection.id && "animate-spin",
                            )}
                          />
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Disconnect institution"
                        aria-label={`Disconnect ${institutionName}`}
                        onClick={() => disconnect(connection.id, institutionName)}
                        disabled={disabled}
                      >
                        <Unlink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {(needsReconnect || hasError) && connection.last_error && (
                    <p className="mt-2 text-sm text-destructive">
                      {connection.last_error}
                    </p>
                  )}
                  {connection.transactions_status === "error" &&
                    connection.transactions_last_error && (
                      <p className="mt-2 text-sm text-destructive">
                        Transaction import: {connection.transactions_last_error}
                      </p>
                    )}
                </CardHeader>
                <CardContent className="p-0">
                  {connection.accounts.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                      No active accounts were returned for this connection.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {connection.accounts.map((account) => (
                        <AccountRow
                          key={account.id}
                          account={account}
                          busy={busyId === account.id}
                          disabled={disabled}
                          onToggle={toggleAccount}
                          onBookkeepingToggle={toggleBookkeepingAccount}
                          onRename={renameAccount}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CreditCard;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function AccountRow({
  account,
  busy,
  disabled,
  onToggle,
  onBookkeepingToggle,
  onRename,
}: {
  account: FinancialAccount;
  busy: boolean;
  disabled: boolean;
  onToggle: (accountId: string, included: boolean) => Promise<void>;
  onBookkeepingToggle: (accountId: string, included: boolean) => Promise<void>;
  onRename: (accountId: string, nickname: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(account.nickname ?? "");
  const isCreditCard =
    account.account_type === "credit" && account.account_subtype === "credit card";

  async function saveNickname() {
    const saved = await onRename(account.id, nickname);
    if (saved) setEditing(false);
  }

  return (
    <div className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
      <div className="min-w-0">
        {editing ? (
          <div className="flex max-w-md items-center gap-1.5">
            <Input
              className="h-8"
              maxLength={80}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveNickname();
                if (event.key === "Escape") {
                  setNickname(account.nickname ?? "");
                  setEditing(false);
                }
              }}
              placeholder="e.g. Payroll Checking"
              aria-label={`Display name for ${account.name}`}
              autoFocus
            />
            <Button size="icon-sm" variant="ghost" title="Save display name" aria-label="Save display name" disabled={disabled} onClick={() => void saveNickname()}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
            <Button size="icon-sm" variant="ghost" title="Cancel" aria-label="Cancel editing display name" disabled={disabled} onClick={() => { setNickname(account.nickname ?? ""); setEditing(false); }}>
              <X />
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate font-medium">{account.nickname ?? account.name}</p>
            <Button size="icon-sm" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground" title="Edit display name" aria-label={`Edit display name for ${account.nickname ?? account.name}`} disabled={disabled} onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {account.nickname && !editing && (
          <p className="truncate text-xs text-muted-foreground">Bank name: {account.name}</p>
        )}
        <p className="text-sm text-muted-foreground">
          {account.mask ? `Ending ${account.mask}` : "Account number unavailable"}
          {account.account_subtype ? ` · ${formatAccountType(account.account_subtype)}` : ""}
          {account.credit_limit_cents !== null
            ? ` · ${formatCurrency(account.credit_limit_cents)} limit`
            : ""}
        </p>
        {(account.minimum_payment_cents !== null || account.next_payment_due_date) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {account.minimum_payment_cents !== null
              ? `${formatCurrency(account.minimum_payment_cents)} minimum`
              : "Minimum unavailable"}
            {account.next_payment_due_date
              ? ` · due ${formatDateOnly(account.next_payment_due_date)}`
              : ""}
          </p>
        )}
      </div>
      <div className="md:text-right">
        <p className="text-xs text-muted-foreground">Current balance</p>
        <p className="font-semibold tabular-nums">
          {account.current_balance_cents === null
            ? "Unavailable"
            : formatCurrency(account.current_balance_cents)}
        </p>
      </div>
      <label className="flex min-w-28 items-center gap-2 text-sm">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={account.included_in_bookkeeping}
            disabled={disabled}
            onChange={(event) =>
              onBookkeepingToggle(account.id, event.target.checked)
            }
          />
        )}
        Use in bookkeeping
      </label>
      {isCreditCard && (
        <label className="flex min-w-28 items-center gap-2 text-sm md:col-start-3">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={account.included_in_total}
            disabled={disabled}
            onChange={(event) => onToggle(account.id, event.target.checked)}
          />
          Include in debt total
        </label>
      )}
    </div>
  );
}

function formatAccountType(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ConnectionStatus({ status }: { status: string }) {
  const labels: Record<string, string> = {
    active: "Connected",
    reconnect_required: "Reconnect",
    error: "Sync error",
  };
  return (
    <Badge variant={status === "active" ? "secondary" : "destructive"}>
      {labels[status] ?? status}
    </Badge>
  );
}

function ConfigurationNotice() {
  return (
    <div className="rounded-md border px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
        <div className="min-w-0">
          <h2 className="font-medium">Plaid credentials are not configured</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the server-only environment variables below before connecting an institution.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {["PLAID_CLIENT_ID", "PLAID_SECRET", "FINANCIAL_TOKEN_ENCRYPTION_KEY"].map(
              (name) => (
                <code key={name} className="rounded bg-muted px-2 py-1">
                  {name}
                </code>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
