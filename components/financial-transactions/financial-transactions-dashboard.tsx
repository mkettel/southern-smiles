"use client";

import Link from "next/link";
import { Combobox } from "@base-ui/react/combobox";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  EyeOff,
  FileText,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
} from "lucide-react";
import { toast } from "sonner";
import {
  refreshFinancialTransactions,
  reviewFinancialTransfer,
  reviewFinancialLoanTransaction,
  reviewFinancialTransaction,
  reviewFinancialTransactions,
} from "@/actions/financial-transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateCashMovement,
  normalizeVendorName,
  transactionDisplayName,
  type BookkeepingAccount,
  type FinancialTransaction,
  type FinancialTransactionAccountSummary,
  type FinancialTransactionDashboardData,
} from "@/lib/financial-transactions";
import { suggestedLoanPaymentAllocations, suggestedLoanPaymentSplit } from "@/lib/financial-loans";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "reviewed" | "excluded";
type ReviewMode = "category" | "transfer" | "loan";
const SCHEDULED_LOAN_GROUP = "__scheduled_loan_group__";
type TransferKind = "internal" | "credit_card_payment" | "line_of_credit_draw" | "loan_payment";

export function FinancialTransactionsDashboard({
  initialData,
  previewMode = false,
}: {
  initialData: FinancialTransactionDashboardData;
  previewMode?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [transactions, setTransactions] = useState(initialData.transactions);
  const accountById = useMemo(
    () => new Map(initialData.accounts.map((account) => [account.id, account])),
    [initialData.accounts],
  );
  const availableMonths = useMemo(() => {
    const months = new Set(transactions.map((transaction) => transaction.transaction_date.slice(0, 7)));
    return [...months].sort().reverse();
  }, [transactions]);
  const [month, setMonth] = useState(() => availableMonths[0] ?? currentMonthKey());
  const accountStats = useMemo(
    () => initialData.accounts.map((account) => buildAccountStats(account, transactions, month)),
    [initialData.accounts, month, transactions],
  );
  const [accountId, setAccountId] = useState(() => {
    const pendingByAccount = new Map<string, number>();
    for (const transaction of initialData.transactions) {
      if (transaction.review_status === "pending" && transaction.account_id) {
        pendingByAccount.set(transaction.account_id, (pendingByAccount.get(transaction.account_id) ?? 0) + 1);
      }
    }
    return [...pendingByAccount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? initialData.accounts[0]?.id ?? "all";
  });
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [query, setQuery] = useState("");
  const [bookkeepingAccountFilterId, setBookkeepingAccountFilterId] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reviewModes, setReviewModes] = useState<Record<string, ReviewMode>>({});
  const [transferKinds, setTransferKinds] = useState<Record<string, TransferKind>>({});
  const [transferAccountIds, setTransferAccountIds] = useState<Record<string, string>>({});
  const [loanIds, setLoanIds] = useState<Record<string, string>>({});
  const [principalAmounts, setPrincipalAmounts] = useState<Record<string, string>>({});
  const [interestAmounts, setInterestAmounts] = useState<Record<string, string>>({});
  const [feeAmounts, setFeeAmounts] = useState<Record<string, string>>({});
  const [interestAccountIds, setInterestAccountIds] = useState<Record<string, string>>({});
  const [feeAccountIds, setFeeAccountIds] = useState<Record<string, string>>({});
  const [bookkeepingAccountIds, setBookkeepingAccountIds] = useState<Record<string, string>>(
    () => Object.fromEntries(
      initialData.transactions.map((transaction) => [
        transaction.id,
        transaction.bookkeeping_account_id ??
          initialData.suggestedBookkeepingAccountByTransaction[transaction.id] ??
          "",
      ]),
    ),
  );

  const bookkeepingAccountsByType = useMemo(() => {
    const grouped = new Map<string, BookkeepingAccount[]>();
    for (const account of initialData.bookkeepingAccounts) {
      const group = grouped.get(account.accountType) ?? [];
      group.push(account);
      grouped.set(account.accountType, group);
    }
    return [...grouped.entries()];
  }, [initialData.bookkeepingAccounts]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return transactions.filter((transaction) => {
      if (!transaction.transaction_date.startsWith(month)) return false;
      if (accountId !== "all" && transaction.account_id !== accountId) return false;
      if (status !== "all" && transaction.review_status !== status) return false;
      if (bookkeepingAccountFilterId !== "all" && bookkeepingAccountIds[transaction.id] !== bookkeepingAccountFilterId) return false;
      if (!normalizedQuery) return true;
      const account = transaction.account_id ? accountById.get(transaction.account_id) : null;
      const bookkeepingAccount = initialData.bookkeepingAccounts.find(
        (candidate) => candidate.id === bookkeepingAccountIds[transaction.id],
      );
      return [
        transactionDisplayName(transaction),
        transaction.original_description,
        transaction.plaid_category_detailed,
        account?.name,
        account?.nickname,
        account?.institutionName,
        bookkeepingAccount ? bookkeepingAccountSearchLabel(bookkeepingAccount) : null,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [accountById, accountId, bookkeepingAccountFilterId, bookkeepingAccountIds, initialData.bookkeepingAccounts, month, query, status, transactions]);

  const resolvedSelectedId = filtered.some((transaction) => transaction.id === selectedId)
    ? selectedId
    : filtered[0]?.id ?? null;
  const selectedIndex = filtered.findIndex((transaction) => transaction.id === resolvedSelectedId);
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;
  const selectedAccount = selected?.account_id ? accountById.get(selected.account_id) : null;
  const selectedReviewMode = selected
    ? reviewModes[selected.id] ?? inferReviewMode(selected)
    : "category";
  const transferCandidates = useMemo(
    () => selected ? findTransferCandidates(selected, transactions) : [],
    [selected, transactions],
  );
  const suggestedTransfer = transferCandidates[0] ?? null;
  const transferAccountId = selected
    ? transferAccountIds[selected.id] ?? suggestedTransfer?.account_id ?? ""
    : "";
  const transferAccount = transferAccountId ? accountById.get(transferAccountId) : null;
  const transferKind = selected
    ? transferKinds[selected.id] ?? inferTransferKind(selected, selectedAccount, transferAccount)
    : "internal";
  const transferMovement = transferMovementAccounts(
    transferKind,
    selectedAccount,
    transferAccount,
    selected?.amount_cents ?? 0,
  );
  const scheduledLoanAllocations = selected && selected.amount_cents > 0
    ? suggestedLoanPaymentAllocations(matchingLoans(selected, initialData.loans), Math.abs(selected.amount_cents), selected.transaction_date)
    : [];
  const explicitLoanSelection = selected ? loanIds[selected.id] : undefined;
  const usesScheduledLoanGroup = scheduledLoanAllocations.length > 1 &&
    (!explicitLoanSelection || explicitLoanSelection === SCHEDULED_LOAN_GROUP);
  const selectedLoanId = selected && !usesScheduledLoanGroup
    ? explicitLoanSelection ?? initialData.suggestedLoanByTransaction[selected.id] ?? ""
    : "";
  const selectedLoan = initialData.loans.find((loan) => loan.id === selectedLoanId) ?? null;
  const selectedValueCents = Math.abs(selected?.amount_cents ?? 0);
  const suggestedSplit = usesScheduledLoanGroup
    ? scheduledLoanAllocations.reduce((total, allocation) => ({
        principal: total.principal + allocation.principal,
        interest: total.interest + allocation.interest,
        fee: total.fee + allocation.fee,
      }), { principal: 0, interest: 0, fee: 0 })
    : suggestedLoanPaymentSplit(selectedLoan, selectedValueCents, selected?.transaction_date);
  const principalCents = selected
    ? usesScheduledLoanGroup ? suggestedSplit.principal : inputCents(principalAmounts[selected.id], suggestedSplit.principal)
    : 0;
  const interestCents = selected
    ? usesScheduledLoanGroup ? suggestedSplit.interest : inputCents(interestAmounts[selected.id], suggestedSplit.interest)
    : 0;
  const feeCents = selected
    ? usesScheduledLoanGroup ? suggestedSplit.fee : inputCents(feeAmounts[selected.id], suggestedSplit.fee)
    : 0;
  const splitRemainingCents = selectedValueCents - principalCents - interestCents - feeCents;
  const expenseAccountsByType = useMemo(() => bookkeepingAccountsByType.map(([type, accounts]): [string, BookkeepingAccount[]] => [type, accounts])
    .filter(([type]) => /expense/i.test(type)), [bookkeepingAccountsByType]);
  const defaultInterestAccountId = initialData.bookkeepingAccounts.find((account) => /interest expense/i.test(account.name))?.id ?? "";
  const defaultFeeAccountId = initialData.bookkeepingAccounts.find((account) => /finance fee|loan fee/i.test(account.name))?.id
    ?? (defaultInterestAccountId || undefined)
    ?? initialData.bookkeepingAccounts.find((account) => /bank service charge/i.test(account.name))?.id
    ?? "";
  const activeAccount = accountId === "all" ? null : accountById.get(accountId);
  const activeStats = accountStats.find((account) => account.id === accountId);
  const monthTransactions = transactions.filter((transaction) => transaction.transaction_date.startsWith(month));
  const cashAccountIds = new Set(initialData.accounts.filter(isCashAccount).map((account) => account.id));
  const cashMovement = calculateCashMovement(monthTransactions.filter((transaction) => transaction.account_id && cashAccountIds.has(transaction.account_id)));
  const activeMovement = activeStats
    ? { inflowCents: activeStats.inflowCents, outflowCents: activeStats.outflowCents, netCents: activeStats.inflowCents - activeStats.outflowCents }
    : cashMovement;
  const summaryLabel = activeAccount
    ? isLiabilityAccount(activeAccount) ? "Net balance activity" : "Net account movement"
    : "Net cash flow";
  const summaryValueCents = activeAccount && isLiabilityAccount(activeAccount)
    ? activeMovement.outflowCents - activeMovement.inflowCents
    : activeMovement.netCents;
  const disabled = isPending || busyId !== null;
  const groupedTransactions = useMemo(() => groupTransactionsByWeek(filtered), [filtered]);
  const filteredTotalCents = filtered.reduce((total, transaction) => total + transaction.amount_cents, 0);
  const filteredBookkeepingAccount = initialData.bookkeepingAccounts.find(
    (account) => account.id === bookkeepingAccountFilterId,
  );
  const bulkEligible = useMemo(() => filtered.filter((transaction) =>
    transaction.review_status === "pending" &&
    Boolean(bookkeepingAccountIds[transaction.id]) &&
    (reviewModes[transaction.id] ?? inferReviewMode(transaction)) === "category"
  ).slice(0, 100), [bookkeepingAccountIds, filtered, reviewModes]);
  const bulkEligibleIds = useMemo(() => new Set(bulkEligible.map((transaction) => transaction.id)), [bulkEligible]);
  const checkedTransactions = useMemo(
    () => filtered.filter((transaction) => checkedIds.has(transaction.id) && bulkEligibleIds.has(transaction.id)),
    [bulkEligibleIds, checkedIds, filtered],
  );
  const allEligibleChecked = bulkEligible.length > 0 && bulkEligible.every((transaction) => checkedIds.has(transaction.id));
  const checkedTotalCents = checkedTransactions.reduce((total, transaction) => total + Math.abs(transaction.amount_cents), 0);
  const vendorHistory = useMemo(() => {
    if (!selected) return null;
    const vendor = normalizeVendorName(transactionDisplayName(selected));
    const matches = transactions.filter(
      (transaction) => normalizeVendorName(transactionDisplayName(transaction)) === vendor,
    );
    return {
      count: matches.length,
      totalCents: matches.reduce((total, transaction) => total + Math.abs(transaction.amount_cents), 0),
      lastDate: matches.map((transaction) => transaction.transaction_date).sort().at(-1) ?? selected.transaction_date,
    };
  }, [selected, transactions]);

  const moveSelection = useCallback((direction: -1 | 1) => {
    if (!filtered.length) return;
    const current = Math.max(0, filtered.findIndex((transaction) => transaction.id === resolvedSelectedId));
    const next = Math.min(filtered.length - 1, Math.max(0, current + direction));
    setSelectedId(filtered[next]?.id ?? null);
  }, [filtered, resolvedSelectedId]);

  async function refresh() {
    if (previewMode) {
      toast.success("Sample transactions are current");
      return;
    }
    setBusyId("refresh");
    const result = await refreshFinancialTransactions();
    setBusyId(null);
    if (result.error) return toast.error(result.error);
    if (result.failed) toast.warning(`${result.failed} institution sync${result.failed === 1 ? "" : "s"} could not finish`);
    else if (result.needsConsent) toast.info("One or more institutions need transaction access enabled.");
    else toast.success(result.imported ? `${result.imported} transaction changes imported` : "Transactions are current");
    startTransition(() => router.refresh());
  }

  const review = useCallback(async (transaction: FinancialTransaction, excluded = false) => {
    const bookkeepingAccountId = bookkeepingAccountIds[transaction.id] || null;
    if (!excluded && !bookkeepingAccountId) {
      toast.error("Choose an account before approving");
      return;
    }
    const applyLocalReview = () => setTransactions((current) => current.map((item) =>
      item.id === transaction.id
        ? {
            ...item,
            bookkeeping_account_id: excluded ? null : bookkeepingAccountId,
            category_source: excluded ? null : "manual",
            review_note: note || null,
            review_status: excluded ? "excluded" : "reviewed",
          }
        : item,
    ));

    if (previewMode) {
      applyLocalReview();
      setNote("");
      toast.success(excluded ? "Sample transaction excluded" : "Sample transaction reviewed");
      return;
    }

    setBusyId(transaction.id);
    const result = await reviewFinancialTransaction({
      transactionId: transaction.id,
      accountId: bookkeepingAccountId,
      status: excluded ? "excluded" : "reviewed",
      note: note || null,
    });
    setBusyId(null);
    if (result.error) return toast.error(result.error);
    applyLocalReview();
    setNote("");
    toast.success(excluded ? "Transaction excluded" : "Transaction reviewed");
    startTransition(() => router.refresh());
  }, [bookkeepingAccountIds, note, previewMode, router]);

  const confirmTransfer = useCallback(async (transaction: FinancialTransaction) => {
    const otherAccountId = transferAccountIds[transaction.id] ??
      findTransferCandidates(transaction, transactions)[0]?.account_id ??
      "";
    if (!otherAccountId) {
      toast.error("Choose the other account first");
      return;
    }
    const matchedTransaction = findTransferCandidates(transaction, transactions)
      .find((candidate) => candidate.account_id === otherAccountId);
    const kind = transferKinds[transaction.id] ?? inferTransferKind(
      transaction,
      transaction.account_id ? accountById.get(transaction.account_id) : null,
      accountById.get(otherAccountId),
    );
    const reviewedIds = new Set(
      [transaction.id, matchedTransaction?.id].filter((id): id is string => Boolean(id)),
    );
    const applyLocalReview = () => setTransactions((current) => current.map((item) =>
      reviewedIds.has(item.id)
        ? {
            ...item,
            bookkeeping_account_id: null,
            category_source: null,
            review_status: "reviewed",
            review_note: note || null,
          }
        : item,
    ));

    if (previewMode) {
      applyLocalReview();
      setNote("");
      toast.success(matchedTransaction ? "Transfer pair matched" : "Transfer confirmed");
      return;
    }

    setBusyId(transaction.id);
    const result = await reviewFinancialTransfer({
      transactionId: transaction.id,
      otherFinancialAccountId: otherAccountId,
      matchedTransactionId: matchedTransaction?.id ?? null,
      transferKind: kind,
      note: note || null,
    });
    setBusyId(null);
    if (result.error) return toast.error(result.error);
    applyLocalReview();
    setNote("");
    toast.success(matchedTransaction ? "Transfer pair matched and posted" : "Transfer posted");
    startTransition(() => router.refresh());
  }, [accountById, note, previewMode, router, transactions, transferAccountIds, transferKinds]);

  const confirmLoanTransaction = useCallback(async (transaction: FinancialTransaction) => {
    const valueCents = Math.abs(transaction.amount_cents);
    const scheduled = transaction.amount_cents > 0
      ? suggestedLoanPaymentAllocations(matchingLoans(transaction, initialData.loans), valueCents, transaction.transaction_date)
      : [];
    const explicitSelection = loanIds[transaction.id];
    const useScheduled = scheduled.length > 1 && (!explicitSelection || explicitSelection === SCHEDULED_LOAN_GROUP);
    const loanId = useScheduled ? "" : explicitSelection ?? initialData.suggestedLoanByTransaction[transaction.id] ?? "";
    if (!useScheduled && !loanId) return toast.error("Choose the loan first");
    const loan = initialData.loans.find((item) => item.id === loanId) ?? null;
    const defaults = suggestedLoanPaymentSplit(loan, valueCents, transaction.transaction_date);
    const allocations = useScheduled
      ? scheduled.map((allocation) => ({
          loanId: allocation.loanId,
          principalCents: allocation.principal,
          interestCents: allocation.interest,
          feeCents: allocation.fee,
        }))
      : [{
          loanId,
          principalCents: inputCents(principalAmounts[transaction.id], defaults.principal),
          interestCents: inputCents(interestAmounts[transaction.id], defaults.interest),
          feeCents: inputCents(feeAmounts[transaction.id], defaults.fee),
        }];
    const principal = allocations.reduce((sum, allocation) => sum + allocation.principalCents, 0);
    const interest = allocations.reduce((sum, allocation) => sum + allocation.interestCents, 0);
    const fees = allocations.reduce((sum, allocation) => sum + allocation.feeCents, 0);
    if (principal + interest + fees !== valueCents) return toast.error("Principal, interest, and fees must equal the transaction amount");
    const interestAccountId = interestAccountIds[transaction.id] ?? defaultInterestAccountId;
    const feeAccountId = feeAccountIds[transaction.id] ?? defaultFeeAccountId;
    if (interest > 0 && !interestAccountId) return toast.error("Choose an interest expense account");
    if (fees > 0 && !feeAccountId) return toast.error("Choose a fee expense account");
    const applyLocalReview = () => setTransactions((current) => current.map((item) => item.id === transaction.id ? { ...item, review_status: "reviewed", review_note: note || null } : item));
    if (previewMode) { applyLocalReview(); toast.success("Sample loan transaction posted"); return; }
    setBusyId(transaction.id);
    const result = await reviewFinancialLoanTransaction({
      transactionId: transaction.id,
      activityKind: transaction.amount_cents < 0 ? "draw" : "payment",
      allocations,
      interestAccountId: interestAccountId || null,
      feeAccountId: feeAccountId || null,
      note: note || null,
    });
    setBusyId(null);
    if (result.error) return toast.error(result.error);
    applyLocalReview(); setNote(""); toast.success(transaction.amount_cents < 0
      ? "Loan draw posted"
      : useScheduled ? `Loan payment allocated across ${allocations.length} loans` : "Loan payment posted");
    startTransition(() => router.refresh());
  }, [defaultFeeAccountId, defaultInterestAccountId, feeAccountIds, feeAmounts, initialData.loans, initialData.suggestedLoanByTransaction, interestAccountIds, interestAmounts, loanIds, note, previewMode, principalAmounts, router]);

  const approveChecked = useCallback(async () => {
    const selectedTransactions = transactions.filter(
      (transaction) => checkedIds.has(transaction.id) &&
        transaction.review_status === "pending" &&
        Boolean(bookkeepingAccountIds[transaction.id]) &&
        (reviewModes[transaction.id] ?? inferReviewMode(transaction)) === "category",
    );
    if (!selectedTransactions.length) {
      toast.error("Select categorized transactions to approve");
      return;
    }
    const selectedTransactionIds = new Set(selectedTransactions.map((transaction) => transaction.id));
    const applyLocalReview = (reviewedIds: Set<string>) => setTransactions((current) => current.map((transaction) =>
      reviewedIds.has(transaction.id)
        ? {
            ...transaction,
            bookkeeping_account_id: bookkeepingAccountIds[transaction.id],
            category_source: "manual",
            review_status: "reviewed",
            review_note: null,
          }
        : transaction,
    ));

    if (previewMode) {
      applyLocalReview(selectedTransactionIds);
      setCheckedIds(new Set());
      toast.success(`${selectedTransactions.length} sample transactions approved`);
      return;
    }

    setBusyId("bulk");
    const result = await reviewFinancialTransactions({
      transactions: selectedTransactions.map((transaction) => ({
        transactionId: transaction.id,
        accountId: bookkeepingAccountIds[transaction.id],
      })),
    });
    setBusyId(null);
    const reviewedIds = new Set(result.reviewedIds);
    if (reviewedIds.size) {
      applyLocalReview(reviewedIds);
      setCheckedIds((current) => new Set([...current].filter((id) => !reviewedIds.has(id))));
    }
    if (result.errors.length) {
      const failedTransactions = result.errors.filter((error) => error.transactionId).length;
      const message = result.errors[0]?.message ?? "Some transactions could not be approved";
      toast.error(reviewedIds.size
        ? `${reviewedIds.size} approved; ${failedTransactions || "rule update"} failed: ${message}`
        : message);
    } else {
      toast.success(`${reviewedIds.size} transactions approved`);
    }
    startTransition(() => router.refresh());
  }, [bookkeepingAccountIds, checkedIds, previewMode, reviewModes, router, transactions]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key.toLowerCase() === "j") moveSelection(1);
      if (event.key.toLowerCase() === "k") moveSelection(-1);
      if (event.key.toLowerCase() === "a" && selected && !disabled) {
        if (selectedReviewMode === "transfer") void confirmTransfer(selected);
        else if (selectedReviewMode === "loan") void confirmLoanTransaction(selected);
        else void review(selected);
      }
      if (event.key.toLowerCase() === "x" && selected && !disabled) void review(selected, true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmLoanTransaction, confirmTransfer, disabled, moveSelection, review, selected, selectedReviewMode]);

  function changeMonth(direction: -1 | 1) {
    const index = availableMonths.indexOf(month);
    const next = availableMonths[index - direction];
    if (next) {
      setMonth(next);
      setCheckedIds(new Set());
    }
  }

  return (
    <div className="space-y-4 [font-family:var(--font-geist-sans)]">
      {initialData.connectionsNeedingConsent > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>{initialData.connectionsNeedingConsent} connected institution{initialData.connectionsNeedingConsent === 1 ? " needs" : "s need"} transaction access enabled.</p>
          <Button size="sm" variant="outline" render={<Link href="/admin/financial-connections" />}>Enable access</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button size="icon-sm" variant="outline" aria-label="Previous month" onClick={() => changeMonth(-1)} disabled={availableMonths.indexOf(month) === availableMonths.length - 1}>
            <ArrowLeft />
          </Button>
          <select className="h-8 rounded-md border bg-background px-3 text-sm font-medium" value={month} onChange={(event) => {
            setMonth(event.target.value);
            setCheckedIds(new Set());
          }} aria-label="Bookkeeping month">
            {availableMonths.map((value) => <option key={value} value={value}>{formatMonth(value)}</option>)}
          </select>
          <Button size="icon-sm" variant="outline" aria-label="Next month" onClick={() => changeMonth(1)} disabled={availableMonths.indexOf(month) <= 0}>
            <ArrowRight />
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{filtered.length} transactions in view</span>
          <Button size="icon-sm" variant="ghost" title="Import latest transactions" aria-label="Import latest transactions" onClick={refresh} disabled={disabled || initialData.connectionCount === 0}>
            {busyId === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        </div>
      </div>

      {initialData.bookkeepingAccounts.length === 0 && (
        <div className="border-y border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">Import the QuickBooks chart of accounts before approving transactions.</div>
      )}

      <div className="min-h-[680px] overflow-hidden rounded-md border bg-background lg:grid lg:grid-cols-[190px_minmax(0,1fr)_280px]">
        <aside className="border-b lg:border-b-0 lg:border-r" aria-label="Bookkeeping accounts">
          <AccountRailItem
            label="All accounts"
            detail={`${transactions.filter((transaction) => transaction.transaction_date.startsWith(month) && transaction.review_status === "pending").length} need review`}
            progress={overallProgress(transactions, month)}
            accent={accountAccents[0]}
            selected={accountId === "all"}
            onClick={() => {
              setAccountId("all");
              setCheckedIds(new Set());
            }}
          />
          {accountStats.map((account) => (
            <AccountRailItem
              key={account.id}
              label={accountDisplayName(account)}
              mask={account.mask}
              detail={`${account.pendingCount} need review`}
              progress={account.progress}
              accent={accountAccent(account.id)}
              selected={accountId === account.id}
              onClick={() => {
                setAccountId(account.id);
                setCheckedIds(new Set());
              }}
            />
          ))}
        </aside>

        <main className="min-w-0 border-b lg:border-b-0 lg:border-r">
          <section className="border-b px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-semibold">
                  {activeAccount && <span className={cn("h-2 w-2 shrink-0 rounded-full", accountAccent(activeAccount.id).dot)} />}
                  <span>{activeAccount ? accountDisplayName(activeAccount) : "All bookkeeping accounts"}{activeAccount ? <AccountMask account={activeAccount} /> : null}</span>
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{activeAccount ? `${activeAccount.institutionName} · ` : ""}{formatMonth(month)} activity imported from connected institutions</p>
              </div>
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value={accountId} onChange={(event) => {
                setAccountId(event.target.value);
                setCheckedIds(new Set());
              }} aria-label="Change account">
                <option value="all">Change account</option>
                {initialData.accounts.map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}{accountMaskText(account)}</option>)}
              </select>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x text-sm">
              <SummaryStat label={summaryLabel} value={formatSignedCurrency(summaryValueCents)} tone={summaryValueCents > 0 && !activeAccount ? "positive" : "default"} />
              <SummaryStat label="Imported" value={String(activeStats?.totalCount ?? monthTransactions.length)} />
              <SummaryStat label="Needs review" value={String(activeStats?.pendingCount ?? monthTransactions.filter((transaction) => transaction.review_status === "pending").length)} />
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
            <select className="h-8 rounded-md border bg-background px-2 text-xs" value={status} onChange={(event) => {
              setStatus(event.target.value as StatusFilter);
              setCheckedIds(new Set());
            }} aria-label="Transaction status">
              <option value="pending">Needs review</option>
              <option value="all">All transactions</option>
              <option value="reviewed">Reviewed</option>
              <option value="excluded">Excluded</option>
            </select>
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 pl-8 text-xs" value={query} onChange={(event) => {
                setQuery(event.target.value);
                setCheckedIds(new Set());
              }} placeholder="Search transactions" />
            </div>
            <div className="relative min-w-44">
              <Tags className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select
                className="h-8 w-full appearance-none rounded-md border bg-background pl-8 pr-7 text-xs"
                value={bookkeepingAccountFilterId}
                onChange={(event) => {
                  setBookkeepingAccountFilterId(event.target.value);
                  setCheckedIds(new Set());
                }}
                aria-label="Chart of account filter"
              >
                <option value="all">All chart accounts</option>
                {bookkeepingAccountsByType.map(([type, accounts]) => (
                  <optgroup key={type} label={type}>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{bookkeepingAccountSearchLabel(account)}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            {filteredBookkeepingAccount && (
              <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-950">
                <span className="font-medium">{bookkeepingAccountSearchLabel(filteredBookkeepingAccount)}</span>
                <span className="tabular-nums">
                  {filtered.length} {filtered.length === 1 ? "transaction" : "transactions"} · {formatCurrency(filteredTotalCents)} total in view
                </span>
              </div>
            )}
          </section>

          {checkedTransactions.length > 0 && (
            <section className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
              <div className="text-sm">
                <span className="font-semibold">{checkedTransactions.length} selected</span>
                <span className="ml-2 text-xs text-muted-foreground">{formatCurrency(checkedTotalCents)} total activity</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setCheckedIds(new Set())} disabled={disabled}>Clear</Button>
                <Button size="sm" className="bg-emerald-700 text-white hover:bg-emerald-800" onClick={approveChecked} disabled={disabled}>
                  {busyId === "bulk" ? <Loader2 className="animate-spin" /> : <Check />}
                  Approve selected
                </Button>
              </div>
            </section>
          )}

          <div className="grid grid-cols-[28px_48px_minmax(100px,1fr)_80px_16px] items-center border-b bg-muted/30 px-3 py-2 text-[11px] font-medium text-muted-foreground md:grid-cols-[28px_48px_minmax(110px,1.2fr)_minmax(90px,1fr)_80px_16px]">
            <input
              type="checkbox"
              aria-label="Select all categorized transactions in view"
              title="Select up to 100 categorized transactions in this view"
              checked={allEligibleChecked}
              disabled={disabled || bulkEligible.length === 0}
              onChange={() => setCheckedIds((current) => {
                const next = new Set(current);
                if (allEligibleChecked) bulkEligible.forEach((transaction) => next.delete(transaction.id));
                else bulkEligible.forEach((transaction) => next.add(transaction.id));
                return next;
              })}
              className="h-4 w-4 rounded border-border accent-emerald-700"
            />
            <span>Date</span>
            <span>Merchant</span>
            <span className="hidden md:block">Imported description</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          <div className="max-h-[480px] overflow-auto">
            {groupedTransactions.length ? groupedTransactions.map((group) => (
              <div key={group.label}>
                <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2 text-xs">
                  <span className="flex items-center gap-2 font-medium"><ChevronDown className="h-3.5 w-3.5" />{group.label}<span className="font-normal text-muted-foreground">{group.items.length} transactions</span></span>
                  <span className="tabular-nums text-muted-foreground">{formatSignedTotal(group.items)}</span>
                </div>
                {group.items.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    selected={transaction.id === resolvedSelectedId}
                    checked={checkedIds.has(transaction.id)}
                    checkDisabled={!bulkEligibleIds.has(transaction.id) || disabled}
                    account={transaction.account_id ? accountById.get(transaction.account_id) : undefined}
                    bookkeepingAccountId={bookkeepingAccountIds[transaction.id]}
                    bookkeepingAccounts={initialData.bookkeepingAccounts}
                    onSelect={() => { setSelectedId(transaction.id); setNote(transaction.review_note ?? ""); }}
                    onCheck={() => setCheckedIds((current) => {
                      const next = new Set(current);
                      if (next.has(transaction.id)) next.delete(transaction.id);
                      else next.add(transaction.id);
                      return next;
                    })}
                  />
                ))}
              </div>
            )) : (
              <div className="px-6 py-16 text-center"><Check className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 font-medium">No transactions in this view</p><p className="mt-1 text-sm text-muted-foreground">Choose another account, month, or status.</p></div>
            )}
          </div>
        </main>

        <aside className="bg-muted/[0.12] lg:max-h-[calc(100vh-220px)] lg:min-h-[560px] lg:overflow-y-auto" aria-label="Transaction review inspector">
          {selected ? (
            <>
              <div className="flex items-center justify-between border-b px-4 py-3 text-xs text-muted-foreground">
                <span>Transaction {selectedIndex + 1} of {filtered.length}</span>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Previous transaction" onClick={() => moveSelection(-1)} disabled={selectedIndex <= 0}><ArrowLeft /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Next transaction" onClick={() => moveSelection(1)} disabled={selectedIndex >= filtered.length - 1}><ArrowRight /></Button>
                </div>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold leading-tight">{transactionDisplayName(selected)}</h3>
                    <p className={cn("whitespace-nowrap text-lg font-semibold tabular-nums", selected.amount_cents < 0 && "text-emerald-700")}>{formatSignedAmount(selected.amount_cents)}</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{formatFullDate(selected.transaction_date)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedAccount ? `${selectedAccount.institutionName} · ${accountDisplayName(selectedAccount)}${accountMaskText(selectedAccount)}` : ""}</p>
                </div>

                <InspectorField label="Imported category">
                  <div className="flex h-9 items-center rounded-md border bg-background px-3 text-sm">{formatPlaidCategory(selected.plaid_category_detailed) ?? "Uncategorized bank activity"}</div>
                </InspectorField>
                <InspectorField label="Transaction type">
                  <div className="grid grid-cols-3 rounded-md border bg-muted/30 p-1" role="group" aria-label="Transaction type">
                    <button
                      type="button"
                      className={cn("flex h-8 items-center justify-center gap-2 rounded-sm text-xs font-medium transition-colors", selectedReviewMode === "category" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      onClick={() => setReviewModes((current) => ({ ...current, [selected.id]: "category" }))}
                    >
                      <Tags className="h-3.5 w-3.5" />Category
                    </button>
                    <button
                      type="button"
                      className={cn("flex h-8 items-center justify-center gap-2 rounded-sm text-xs font-medium transition-colors", selectedReviewMode === "transfer" ? "bg-background text-sky-800 shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      onClick={() => setReviewModes((current) => ({ ...current, [selected.id]: "transfer" }))}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />Transfer
                    </button>
                    <button
                      type="button"
                      className={cn("flex h-8 items-center justify-center gap-2 rounded-sm text-xs font-medium transition-colors", selectedReviewMode === "loan" ? "bg-background text-amber-800 shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      onClick={() => setReviewModes((current) => ({ ...current, [selected.id]: "loan" }))}
                    >
                      <Landmark className="h-3.5 w-3.5" />Loan
                    </button>
                  </div>
                </InspectorField>

                {selectedReviewMode === "category" ? (
                  <>
                    <InspectorField label="Chart of account">
                      <BookkeepingAccountCombobox
                        accountsByType={bookkeepingAccountsByType}
                        value={bookkeepingAccountIds[selected.id] ?? ""}
                        onValueChange={(value) => setBookkeepingAccountIds((current) => ({
                          ...current,
                          [selected.id]: value,
                        }))}
                      />
                    </InspectorField>

                    {initialData.suggestedBookkeepingAccountByTransaction[selected.id] && !selected.bookkeeping_account_id && (
                      <div className="border-y py-4">
                        <p className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-emerald-700" />Rule match</p>
                        <p className="mt-2 text-sm">{transactionDisplayName(selected)} → {bookkeepingAccountName(initialData.bookkeepingAccounts, bookkeepingAccountIds[selected.id])}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Suggested from prior vendor history</p>
                      </div>
                    )}
                  </>
                ) : selectedReviewMode === "transfer" ? (
                  <div className="space-y-4">
                    <InspectorField label="Transfer type">
                      <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        value={transferKind}
                        onChange={(event) => setTransferKinds((current) => ({ ...current, [selected.id]: event.target.value as TransferKind }))}
                      >
                        <option value="internal">Between accounts</option>
                        <option value="credit_card_payment">Credit-card payment</option>
                        <option value="line_of_credit_draw">Line-of-credit draw</option>
                        <option value="loan_payment">Loan payment</option>
                      </select>
                    </InspectorField>

                    <InspectorField label="Other connected account">
                      <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        value={transferAccountId}
                        onChange={(event) => setTransferAccountIds((current) => ({ ...current, [selected.id]: event.target.value }))}
                      >
                        <option value="">Choose account</option>
                        {initialData.accounts.filter((account) => account.id !== selected.account_id).map((account) => (
                          <option key={account.id} value={account.id}>{account.institutionName} · {accountDisplayName(account)}{accountMaskText(account)}</option>
                        ))}
                      </select>
                    </InspectorField>

                    <div className="rounded-md border border-sky-200 bg-sky-50/70 p-3">
                      {suggestedTransfer && transferAccount ? (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <p className="flex items-center gap-2 text-sm font-medium text-sky-950"><Check className="h-4 w-4 text-sky-700" />Possible match found</p>
                            <span className="text-xs font-medium tabular-nums text-sky-900">{formatSignedAmount(suggestedTransfer.amount_cents)}</span>
                          </div>
                          <p className="mt-2 text-sm font-medium">{transferAccount.institutionName} · {accountDisplayName(transferAccount)}{accountMaskText(transferAccount)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatFullDate(suggestedTransfer.transaction_date)} · Same amount, opposite direction</p>
                        </>
                      ) : (
                        <>
                          <p className="flex items-center gap-2 text-sm font-medium"><Search className="h-4 w-4 text-sky-700" />No exact match yet</p>
                          <p className="mt-1 text-xs text-muted-foreground">You can post one side now. The imported match can be linked when it arrives.</p>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                      <AccountMovementLabel label="From" account={transferMovement.from} />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <AccountMovementLabel label="To" account={transferMovement.to} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <InspectorField label={selected.amount_cents < 0 ? "Loan or credit line" : "Loan being paid"}>
                      <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={usesScheduledLoanGroup ? SCHEDULED_LOAN_GROUP : selectedLoanId} onChange={(event) => setLoanIds((current) => ({ ...current, [selected.id]: event.target.value }))}>
                        <option value="">Choose loan</option>
                        {scheduledLoanAllocations.length > 1 && <option value={SCHEDULED_LOAN_GROUP}>{initialData.loans.find((loan) => loan.id === scheduledLoanAllocations[0]?.loanId)?.lenderName} · {scheduledLoanAllocations.length} scheduled loans</option>}
                        {initialData.loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.lenderName} · {loan.name} · {formatCurrency(loan.currentBalanceCents)}</option>)}
                      </select>
                    </InspectorField>
                    {usesScheduledLoanGroup ? (
                      <div className="divide-y rounded-md border border-amber-200 bg-amber-50/70 text-xs">
                        {scheduledLoanAllocations.map((allocation) => {
                          const loan = initialData.loans.find((item) => item.id === allocation.loanId);
                          return <div key={allocation.loanId} className="p-3"><div className="flex justify-between gap-3"><span className="font-medium text-amber-950">{loan?.name ?? "Scheduled loan"}</span><span className="font-semibold tabular-nums text-amber-950">{formatCurrency(allocation.principal + allocation.interest + allocation.fee)}</span></div><p className="mt-1 text-muted-foreground">{formatCurrency(allocation.principal)} principal{allocation.interest > 0 && ` · ${formatCurrency(allocation.interest)} interest`}{allocation.fee > 0 && ` · ${formatCurrency(allocation.fee)} fee`}</p></div>;
                        })}
                      </div>
                    ) : selectedLoan && <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs"><div className="flex justify-between gap-3"><span className="font-medium text-amber-950">Current loan balance</span><span className="font-semibold tabular-nums text-amber-950">{formatCurrency(selectedLoan.currentBalanceCents)}</span></div>{selectedLoan.scheduledPaymentCents && <p className="mt-1 text-muted-foreground">Expected payment {formatCurrency(selectedLoan.scheduledPaymentCents)} · {selectedLoan.paymentFrequency}</p>}</div>}
                    {selected.amount_cents < 0 ? <p className="text-xs text-muted-foreground">This inflow increases the loan balance by {formatCurrency(selectedValueCents)}. It does not count as income.</p> : <>
                      {!usesScheduledLoanGroup && <div className="grid grid-cols-3 gap-2">
                        <AmountField label="Principal" value={principalAmounts[selected.id] ?? dollarsFromCents(suggestedSplit.principal)} onChange={(value) => setPrincipalAmounts((current) => ({ ...current, [selected.id]: value }))} />
                        <AmountField label="Interest" value={interestAmounts[selected.id] ?? dollarsFromCents(suggestedSplit.interest)} onChange={(value) => setInterestAmounts((current) => ({ ...current, [selected.id]: value }))} />
                        <AmountField label="Fees" value={feeAmounts[selected.id] ?? dollarsFromCents(suggestedSplit.fee)} onChange={(value) => setFeeAmounts((current) => ({ ...current, [selected.id]: value }))} />
                      </div>}
                      <div className={cn("flex justify-between rounded-md border px-3 py-2 text-xs", splitRemainingCents === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}><span>{splitRemainingCents === 0 ? "Split matches payment" : "Amount left to assign"}</span><span className="font-semibold tabular-nums">{formatCurrency(Math.abs(splitRemainingCents))}</span></div>
                      {interestCents > 0 && <InspectorField label="Interest expense account"><BookkeepingAccountCombobox accountsByType={expenseAccountsByType} value={interestAccountIds[selected.id] ?? defaultInterestAccountId} onValueChange={(value) => setInterestAccountIds((current) => ({ ...current, [selected.id]: value }))} /></InspectorField>}
                      {feeCents > 0 && <InspectorField label="Fee expense account"><BookkeepingAccountCombobox accountsByType={expenseAccountsByType} value={feeAccountIds[selected.id] ?? defaultFeeAccountId} onValueChange={(value) => setFeeAccountIds((current) => ({ ...current, [selected.id]: value }))} /></InspectorField>}
                    </>}
                  </div>
                )}

                {vendorHistory && (
                  <div>
                    <p className="text-sm font-medium">Vendor history</p>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      <HistoryRow label="Transactions" value={String(vendorHistory.count)} />
                      <HistoryRow label="Total activity" value={formatCurrency(vendorHistory.totalCents)} />
                      <HistoryRow label="Last transaction" value={formatFullDate(vendorHistory.lastDate)} />
                    </dl>
                  </div>
                )}

                <InspectorField label="Memo (optional)">
                  <Textarea className="min-h-16 resize-none" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a memo…" />
                  <p className="mt-1 text-right text-[11px] text-muted-foreground">{note.length}/1000</p>
                </InspectorField>

                <div className="sticky bottom-0 -mx-4 -mb-4 space-y-2 border-t bg-background/95 p-4 backdrop-blur-sm">
                  {selectedReviewMode === "transfer" ? (
                    <Button size="sm" className="w-full bg-sky-700 text-white hover:bg-sky-800" onClick={() => confirmTransfer(selected)} disabled={disabled || !transferAccountId}>{busyId === selected.id ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}Post transfer</Button>
                  ) : selectedReviewMode === "loan" ? (
                    <Button size="sm" className="w-full bg-amber-700 text-white hover:bg-amber-800" onClick={() => confirmLoanTransaction(selected)} disabled={disabled || (!usesScheduledLoanGroup && !selectedLoanId) || splitRemainingCents !== 0}>{busyId === selected.id ? <Loader2 className="animate-spin" /> : <Landmark />}{selected.amount_cents < 0 ? "Post loan draw" : usesScheduledLoanGroup ? "Post allocated payment" : "Post loan payment"}</Button>
                  ) : (
                    <Button size="sm" className="w-full bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => review(selected)} disabled={disabled || !bookkeepingAccountIds[selected.id]}>{busyId === selected.id ? <Loader2 className="animate-spin" /> : <Check />}Approve</Button>
                  )}
                  <Button size="sm" className="w-full" variant="outline" onClick={() => review(selected, true)} disabled={disabled}><EyeOff />Exclude</Button>
                  <Button size="sm" className="w-full text-emerald-700" variant="ghost" onClick={() => moveSelection(1)} disabled={selectedIndex >= filtered.length - 1}>Next transaction <ChevronRight /></Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center"><FileText className="h-6 w-6 text-muted-foreground" /><p className="mt-3 font-medium">Select a transaction</p><p className="mt-1 text-sm text-muted-foreground">Choose a row to review its bookkeeping details.</p></div>
          )}
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>Showing up to 500 recent transactions. Approving an account teaches the next transaction from that vendor.</p>
        <p className="hidden items-center gap-2 md:flex"><Keycap>J</Keycap> Next <Keycap>K</Keycap> Previous <Keycap>A</Keycap> Approve <Keycap>X</Keycap> Exclude</p>
      </div>
    </div>
  );
}

function AccountRailItem({ label, mask, detail, progress, accent, selected, onClick }: { label: string; mask?: string | null; detail: string; progress: number; accent: AccountAccent; selected: boolean; onClick: () => void }) {
  const showMask = mask && !label.includes(mask);
  return <button type="button" onClick={onClick} className={cn("relative flex w-full items-start gap-3 border-b px-4 py-4 text-left transition-colors hover:bg-muted/40", selected && accent.selected)}>
    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", accent.icon)}><Building2 className="h-3.5 w-3.5" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label}{showMask ? <span className="ml-1 font-normal text-muted-foreground">·{mask}</span> : null}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span><span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full", accent.bar)} style={{ width: `${progress}%` }} /></span></span>
    <span className="text-[11px] tabular-nums text-muted-foreground">{progress}%</span>
  </button>;
}

function TransactionRow({ transaction, account, selected, checked, checkDisabled, bookkeepingAccountId, bookkeepingAccounts, onSelect, onCheck }: { transaction: FinancialTransaction; account?: FinancialTransactionAccountSummary; selected: boolean; checked: boolean; checkDisabled: boolean; bookkeepingAccountId?: string; bookkeepingAccounts: BookkeepingAccount[]; onSelect: () => void; onCheck: () => void }) {
  const accountName = bookkeepingAccountName(bookkeepingAccounts, bookkeepingAccountId);
  return <div className={cn("grid w-full grid-cols-[28px_48px_minmax(100px,1fr)_80px_16px] items-center border-b px-3 text-left text-xs transition-colors hover:bg-muted/30 md:grid-cols-[28px_48px_minmax(110px,1.2fr)_minmax(90px,1fr)_80px_16px]", selected && "bg-emerald-50/70 hover:bg-emerald-50/70", checked && !selected && "bg-emerald-50/35")}>
    <input
      type="checkbox"
      aria-label={`Select ${transactionDisplayName(transaction)}`}
      checked={checked}
      disabled={checkDisabled}
      onChange={onCheck}
      className="h-4 w-4 rounded border-border accent-emerald-700"
    />
    <button type="button" onClick={onSelect} className="col-span-4 grid min-w-0 grid-cols-[48px_minmax(100px,1fr)_80px_16px] items-center py-3 text-left md:col-span-5 md:grid-cols-[48px_minmax(110px,1.2fr)_minmax(90px,1fr)_80px_16px]">
      <span className="text-muted-foreground">{formatDateOnly(transaction.transaction_date)}</span>
      <span className="min-w-0 pr-3"><span className="block truncate font-medium">{transactionDisplayName(transaction)}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{account ? `${account.institutionName} · ${accountDisplayName(account)}${accountMaskText(account)}` : "Account unavailable"}</span></span>
      <span className="hidden min-w-0 pr-3 md:block"><span className="block truncate text-muted-foreground">{transaction.original_description ?? formatPlaidCategory(transaction.plaid_category_detailed) ?? "Bank activity"}</span>{accountName && <span className="mt-0.5 block truncate text-[11px] text-emerald-700">{accountName}</span>}</span>
      <span className={cn("text-right font-semibold tabular-nums", transaction.amount_cents < 0 && "text-emerald-700")}>{formatSignedAmount(transaction.amount_cents)}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  </div>;
}

function BookkeepingAccountCombobox({
  accountsByType,
  value,
  onValueChange,
}: {
  accountsByType: [string, BookkeepingAccount[]][];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const groups = useMemo(
    () => accountsByType.map(([accountType, accounts]) => ({ value: accountType, items: accounts })),
    [accountsByType],
  );
  const selectedAccount = useMemo(
    () => accountsByType.flatMap(([, accounts]) => accounts).find((account) => account.id === value) ?? null,
    [accountsByType, value],
  );

  return (
    <Combobox.Root
      items={groups}
      value={selectedAccount}
      onValueChange={(account) => onValueChange(account?.id ?? "")}
      itemToStringLabel={bookkeepingAccountSearchLabel}
      itemToStringValue={(account) => account.id}
      isItemEqualToValue={(account, selected) => account.id === selected.id}
      autoHighlight
    >
      <Combobox.Trigger
        aria-label="Chart of account"
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm outline-none transition-colors hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-placeholder:text-muted-foreground"
      >
        <Combobox.Value placeholder="Choose account" />
        <Combobox.Icon>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Combobox.Icon>
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup
            aria-label="Choose chart of account"
            className="relative isolate z-50 w-(--anchor-width) min-w-72 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <div className="relative border-b bg-background">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Combobox.Input
                aria-label="Search chart of accounts"
                placeholder="Search name or account number"
                className="h-10 w-full bg-transparent pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
              <Combobox.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
                No matching accounts
              </Combobox.Empty>
              <Combobox.List>
                {(group: { value: string; items: BookkeepingAccount[] }) => (
                  <Combobox.Group key={group.value} items={group.items} className="not-last:mb-1">
                    <Combobox.GroupLabel className="px-2 py-1.5 text-[11px] font-medium uppercase text-muted-foreground">
                      {group.value}
                    </Combobox.GroupLabel>
                    <Combobox.Collection>
                      {(account: BookkeepingAccount) => (
                        <Combobox.Item
                          key={account.id}
                          value={account}
                          className="relative flex min-h-9 cursor-default items-center rounded-md py-2 pr-9 pl-2 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {account.accountNumber ? <span className="mr-1.5 font-medium tabular-nums">{account.accountNumber}</span> : null}
                            {account.name}
                          </span>
                          <Combobox.ItemIndicator className="absolute right-2 flex h-4 w-4 items-center justify-center text-emerald-700">
                            <Check className="h-4 w-4" />
                          </Combobox.ItemIndicator>
                        </Combobox.Item>
                      )}
                    </Combobox.Collection>
                  </Combobox.Group>
                )}
              </Combobox.List>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function bookkeepingAccountSearchLabel(account: BookkeepingAccount) {
  return [account.accountNumber, account.name].filter(Boolean).join(" ");
}

function inferReviewMode(transaction: FinancialTransaction): ReviewMode {
  const text = [
    transaction.plaid_category_detailed,
    transaction.name,
    transaction.original_description,
  ].filter(Boolean).join(" ").toLowerCase();
  return /account_transfer|credit_card_payment|online transfer|payment thank you|web pymt|card payment/.test(text)
    ? "transfer"
    : "category";
}

function inferTransferKind(
  transaction: FinancialTransaction,
  sourceAccount?: FinancialTransactionAccountSummary | null,
  otherAccount?: FinancialTransactionAccountSummary | null,
): TransferKind {
  const text = [
    transaction.plaid_category_detailed,
    transaction.name,
    transaction.original_description,
    sourceAccount?.name,
    sourceAccount?.nickname,
    sourceAccount?.accountType,
    sourceAccount?.accountSubtype,
    otherAccount?.name,
    otherAccount?.nickname,
    otherAccount?.accountType,
    otherAccount?.accountSubtype,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/line of credit|line_of_credit|loc\b/.test(text)) return "line_of_credit_draw";
  if (/loan/.test(text)) return "loan_payment";
  if (/credit_card|credit card|mastercard|visa|amex|capital one|payment thank you/.test(text)) {
    return "credit_card_payment";
  }
  return "internal";
}

function findTransferCandidates(
  transaction: FinancialTransaction,
  transactions: FinancialTransaction[],
) {
  return transactions
    .filter((candidate) =>
      candidate.id !== transaction.id &&
      candidate.account_id &&
      candidate.account_id !== transaction.account_id &&
      candidate.review_status === "pending" &&
      candidate.amount_cents === -transaction.amount_cents &&
      dayDistance(candidate.transaction_date, transaction.transaction_date) <= 7,
    )
    .sort((left, right) =>
      dayDistance(left.transaction_date, transaction.transaction_date) -
      dayDistance(right.transaction_date, transaction.transaction_date),
    );
}

function dayDistance(first: string, second: string) {
  return Math.abs(parseDate(first).getTime() - parseDate(second).getTime()) / 86_400_000;
}

function transferMovementAccounts(
  kind: TransferKind,
  selectedAccount: FinancialTransactionAccountSummary | null | undefined,
  otherAccount: FinancialTransactionAccountSummary | null | undefined,
  amountCents: number,
) {
  if (kind === "credit_card_payment" || kind === "loan_payment") {
    const selectedIsLiability = isLiabilityAccount(selectedAccount);
    return selectedIsLiability
      ? { from: otherAccount, to: selectedAccount }
      : { from: selectedAccount, to: otherAccount };
  }
  if (kind === "line_of_credit_draw") {
    const selectedIsLiability = isLiabilityAccount(selectedAccount);
    return selectedIsLiability
      ? { from: selectedAccount, to: otherAccount }
      : { from: otherAccount, to: selectedAccount };
  }
  return amountCents >= 0
    ? { from: selectedAccount, to: otherAccount }
    : { from: otherAccount, to: selectedAccount };
}

function isLiabilityAccount(account?: FinancialTransactionAccountSummary | null) {
  return Boolean(account && /credit|loan/i.test(`${account.accountType} ${account.accountSubtype ?? ""}`));
}

function AccountMovementLabel({
  label,
  account,
}: {
  label: string;
  account?: FinancialTransactionAccountSummary | null;
}) {
  const Icon = isLiabilityAccount(account)
    ? CreditCard
    : Building2;
  return (
    <div className="min-w-0 rounded-md border bg-background p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className="mt-1 truncate font-medium">{account ? accountDisplayName(account) : "Choose account"}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{account ? `${account.institutionName}${accountMaskText(account)}` : "Not selected"}</p>
    </div>
  );
}

function SummaryStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "positive" }) { return <div className="px-4 first:pl-0"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-1 font-semibold tabular-nums", tone === "positive" && "text-emerald-700")}>{value}</p></div>; }
function InspectorField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-medium">{label}</span>{children}</label>; }
function AmountField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block"><span className="mb-2 block text-[11px] font-medium">{label}</span><Input className="h-8 px-2 text-xs tabular-nums" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function HistoryRow({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium tabular-nums">{value}</dd></div>; }
function Keycap({ children }: { children: React.ReactNode }) { return <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">{children}</span>; }

function buildAccountStats(account: FinancialTransactionAccountSummary, transactions: FinancialTransaction[], month: string) {
  const items = transactions.filter((transaction) => transaction.account_id === account.id && transaction.transaction_date.startsWith(month));
  const pendingCount = items.filter((transaction) => transaction.review_status === "pending").length;
  const reviewedCount = items.filter((transaction) => transaction.review_status === "reviewed").length;
  const denominator = pendingCount + reviewedCount;
  const movement = calculateCashMovement(items);
  return { ...account, pendingCount, totalCount: items.length, ...movement, progress: denominator ? Math.round((reviewedCount / denominator) * 100) : 100 };
}
function overallProgress(transactions: FinancialTransaction[], month: string) { const items = transactions.filter((transaction) => transaction.transaction_date.startsWith(month)); const pending = items.filter((item) => item.review_status === "pending").length; const reviewed = items.filter((item) => item.review_status === "reviewed").length; return pending + reviewed ? Math.round((reviewed / (pending + reviewed)) * 100) : 100; }
function isCashAccount(account: FinancialTransactionAccountSummary) { return /depository/i.test(account.accountType); }
function groupTransactionsByWeek(transactions: FinancialTransaction[]) { const groups = new Map<string, FinancialTransaction[]>(); for (const transaction of transactions) { const date = parseDate(transaction.transaction_date); const day = date.getDay(); const monday = new Date(date); monday.setDate(date.getDate() - ((day + 6) % 7)); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); const label = `Week of ${formatDateOnly(toDateKey(monday))} – ${formatDateOnly(toDateKey(sunday))}`; const items = groups.get(label) ?? []; items.push(transaction); groups.set(label, items); } return [...groups.entries()].map(([label, items]) => ({ label, items })); }
function parseDate(value: string) { return new Date(`${value}T12:00:00`); }
function toDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function currentMonthKey() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function formatMonth(value: string) { const [year, month] = value.split("-").map(Number); return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1)); }
function matchingLoans(transaction: FinancialTransaction, loans: FinancialTransactionDashboardData["loans"]) {
  const description = [transaction.name, transaction.merchant_name, transaction.original_description]
    .filter(Boolean).join(" ").toLowerCase();
  return loans.filter((loan) => description.includes(loan.lenderName.toLowerCase()) ||
    transaction.bookkeeping_account_id === loan.bookkeepingAccountId);
}

function formatCurrency(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function formatSignedCurrency(cents: number) { return `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${formatCurrency(Math.abs(cents))}`; }
function dollarsFromCents(cents: number) { return (cents / 100).toFixed(2); }
function inputCents(value: string | undefined, fallback: number) { if (value === undefined) return fallback; const amount = Number(value); return Number.isFinite(amount) ? Math.round(amount * 100) : 0; }
function formatSignedAmount(cents: number) { return `${cents < 0 ? "+" : "−"}${formatCurrency(Math.abs(cents))}`; }
function formatSignedTotal(items: FinancialTransaction[]) { const total = items.reduce((sum, item) => sum + item.amount_cents, 0); return formatSignedAmount(total); }
function formatDateOnly(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseDate(value)); }
function formatFullDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parseDate(value)); }
function formatPlaidCategory(value: string | null) { if (!value) return null; return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function bookkeepingAccountName(accounts: BookkeepingAccount[], id?: string) { const account = accounts.find((item) => item.id === id); return account ? `${account.accountNumber ? `${account.accountNumber} ` : ""}${account.name}` : null; }

interface AccountAccent { selected: string; icon: string; bar: string; dot: string }
const accountAccents: AccountAccent[] = [
  { selected: "bg-emerald-50/70 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-emerald-700", icon: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-600", dot: "bg-emerald-600" },
  { selected: "bg-sky-50/80 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-sky-700", icon: "bg-sky-100 text-sky-800", bar: "bg-sky-600", dot: "bg-sky-600" },
  { selected: "bg-violet-50/70 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-violet-700", icon: "bg-violet-100 text-violet-800", bar: "bg-violet-600", dot: "bg-violet-600" },
  { selected: "bg-amber-50/80 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-amber-700", icon: "bg-amber-100 text-amber-800", bar: "bg-amber-600", dot: "bg-amber-600" },
  { selected: "bg-rose-50/70 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-rose-700", icon: "bg-rose-100 text-rose-800", bar: "bg-rose-600", dot: "bg-rose-600" },
];
function accountAccent(id: string) { return accountAccents[[...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % accountAccents.length] ?? accountAccents[0]; }
function accountDisplayName(account: FinancialTransactionAccountSummary) { return account.nickname?.trim() || account.name; }
function accountMaskText(account: FinancialTransactionAccountSummary) { const label = accountDisplayName(account); return account.mask && !label.includes(account.mask) ? ` ·${account.mask}` : ""; }
function AccountMask({ account }: { account: FinancialTransactionAccountSummary }) { const suffix = accountMaskText(account); return suffix ? <span className="ml-1 font-normal text-muted-foreground">{suffix}</span> : null; }
