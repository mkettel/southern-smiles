"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Landmark, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveFinancialLoan } from "@/actions/financial-loans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { availableCredit, creditUtilization, loanProgress, monthlyPaymentEquivalent, type FinancialLoan, type FinancialLoansData } from "@/lib/financial-loans";
import { cn } from "@/lib/utils";

export function FinancialLoansDashboard({ initialData }: { initialData: FinancialLoansData }) {
  const activeLoans = initialData.loans.filter((loan) => loan.status === "active");
  const [selectedId, setSelectedId] = useState(activeLoans[0]?.id ?? initialData.loans[0]?.id ?? null);
  const selected = initialData.loans.find((loan) => loan.id === selectedId) ?? null;
  const totalDebt = activeLoans.reduce((sum, loan) => sum + loan.currentBalanceCents, 0);
  const monthlyDebtService = activeLoans.reduce((sum, loan) => sum + monthlyPaymentEquivalent(loan), 0);
  const incomplete = activeLoans.filter((loan) => loan.termsStatus !== "verified").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Loans & credit</h2>
          <p className="mt-1 text-sm text-muted-foreground">Track principal, financing cost, and the liability behind every payment.</p>
        </div>
        <LoanEditor accounts={initialData.liabilityAccounts} />
      </div>

      <div className="grid border-y sm:grid-cols-4">
        <Summary label="Outstanding debt" value={money(totalDebt)} />
        <Summary label="Monthly equivalent" value={money(monthlyDebtService)} />
        <Summary label="Active loans" value={String(activeLoans.length)} />
        <Summary label="Need term details" value={String(incomplete)} warning={incomplete > 0} />
      </div>

      <div className="grid overflow-hidden rounded-lg border bg-card lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/35 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-3 font-medium">Loan or credit</th><th className="px-3 py-3 font-medium">Payment</th><th className="px-3 py-3 text-right font-medium">{initialData.loans.some(isLineOfCredit) ? "Balance / drawn" : "Balance"}</th><th className="px-4 py-3 font-medium">Progress / utilization</th></tr>
            </thead>
            <tbody>
              {initialData.loans.map((loan) => {
                const revolving = isLineOfCredit(loan);
                const progress = revolving ? creditUtilization(loan) : loanProgress(loan);
                return (
                  <tr key={loan.id} onClick={() => setSelectedId(loan.id)} className={cn("cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30", selectedId === loan.id && "bg-sky-50/70")}>
                    <td className="px-4 py-3"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-sky-100 text-sky-800"><Landmark className="h-4 w-4" /></span><div className="min-w-0"><p className="font-medium">{loan.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{loan.lenderName}{loan.accountReference ? ` · ${loan.accountReference}` : ""}</p></div></div></td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{loan.scheduledPaymentCents ? money(loan.scheduledPaymentCents) : "—"}<p className="text-xs capitalize text-muted-foreground">{frequencyLabel(loan.paymentFrequency)}</p></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{money(loan.currentBalanceCents)}{loan.status !== "active" && <p className="text-xs font-normal capitalize text-muted-foreground">{loan.status.replace("_", " ")}</p>}</td>
                    <td className="min-w-32 px-4 py-3">{progress === null ? <span className="text-xs text-muted-foreground">{revolving ? "Credit limit needed" : "Original balance needed"}</span> : <><div className="flex justify-between text-xs"><span>{progress}% {revolving ? "utilized" : "paid"}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full", revolving ? utilizationColor(progress) : "bg-emerald-600")} style={{ width: `${Math.min(progress, 100)}%` }} /></div></>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="border-t bg-muted/[0.12] p-5 lg:border-l lg:border-t-0">
          {selected ? <LoanDetail loan={selected} accounts={initialData.liabilityAccounts} /> : <p className="text-sm text-muted-foreground">Add a loan to begin tracking debt.</p>}
        </aside>
      </div>
      <p className="text-xs text-muted-foreground">QuickBooks balances are imported as a dated starting point. Future loan payments update principal here and send only interest and fees to the profit and loss report.</p>
    </div>
  );
}

function LoanDetail({ loan, accounts }: { loan: FinancialLoan; accounts: FinancialLoansData["liabilityAccounts"] }) {
  const lastPayment = loan.payments[0];
  const revolving = isLineOfCredit(loan);
  const utilization = creditUtilization(loan);
  const available = availableCredit(loan);
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{loan.lenderName}</p><h3 className="mt-1 text-lg font-semibold">{loan.name}</h3></div><LoanEditor loan={loan} accounts={accounts} /></div>
    <div><p className="text-xs text-muted-foreground">{revolving ? "Currently drawn" : "Current balance"}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(loan.currentBalanceCents)}</p><p className="mt-1 text-xs text-muted-foreground">As of {dateLabel(loan.balanceAsOfDate)}</p></div>
    <div className="flex flex-wrap gap-2"><Badge variant={loan.termsStatus === "verified" ? "secondary" : "outline"}>{loan.termsStatus === "verified" ? <CheckCircle2 /> : <AlertTriangle />}{termsLabel(loan.termsStatus)}</Badge>{loan.isPersonal && <Badge variant="outline">Personal</Badge>}<Badge variant="outline">{loan.source === "quickbooks_browser" ? "QuickBooks verified" : "Manual"}</Badge></div>
    <dl className="space-y-2 border-y py-4 text-xs">{revolving ? <><Detail label="Credit limit" value={loan.creditLimitCents === null ? "Needed" : money(loan.creditLimitCents)} /><Detail label="Available credit" value={available === null ? "Enter credit limit" : money(available)} /><Detail label="Utilization" value={utilization === null ? "Enter credit limit" : `${utilization}%`} /><Detail label="Minimum payment" value={loan.scheduledPaymentCents === null ? "Needed" : `${money(loan.scheduledPaymentCents)} ${frequencyLabel(loan.paymentFrequency)}`} /><Detail label="APR" value={loan.annualInterestRate === null ? "Needed" : `${loan.annualInterestRate}%`} /></> : <><Detail label="Original principal" value={loan.originalPrincipalCents === null ? "Needed" : money(loan.originalPrincipalCents)} /><Detail label="Scheduled payment" value={loan.scheduledPaymentCents === null ? "Needed" : `${money(loan.scheduledPaymentCents)} ${frequencyLabel(loan.paymentFrequency)}`} /><Detail label="Interest method" value={loan.interestMethod.replace("_", " ")} /><Detail label="APR" value={loan.annualInterestRate === null ? "Needed" : `${loan.annualInterestRate}%`} /><Detail label="Maturity" value={loan.maturityDate ? dateLabel(loan.maturityDate) : "Needed"} /></>}</dl>
    {lastPayment ? <div><p className="text-sm font-medium">Latest recorded payment</p><p className="mt-2 text-xs text-muted-foreground">{dateLabel(lastPayment.paymentDate)} · {money(lastPayment.totalCents)}</p><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><Mini label="Principal" value={money(lastPayment.principalCents)} /><Mini label="Interest" value={money(lastPayment.interestCents)} /><Mini label="Fees" value={money(lastPayment.feeCents)} /></div></div> : <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Payment splits will appear here after they are posted from Bookkeeping.</div>}
    {loan.notes && <p className="text-xs leading-5 text-muted-foreground">{loan.notes}</p>}
  </div>;
}

function LoanEditor({ loan, accounts }: { loan?: FinancialLoan; accounts: FinancialLoansData["liabilityAccounts"] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const initial = useMemo(() => formState(loan, accounts[0]?.id ?? ""), [accounts, loan]);
  const [form, setForm] = useState(initial);
  const field = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const revolving = form.loanType === "line_of_credit";
  async function submit() {
    const result = await saveFinancialLoan({
      id: loan?.id ?? null, bookkeepingAccountId: form.bookkeepingAccountId,
      name: form.name, lenderName: form.lenderName, loanType: form.loanType,
      accountReference: form.accountReference || null,
      originalPrincipalCents: revolving ? null : cents(form.originalPrincipal),
      creditLimitCents: revolving ? cents(form.creditLimit) : null,
      currentBalanceCents: cents(form.currentBalance) ?? 0,
      scheduledPaymentCents: cents(form.scheduledPayment), paymentFrequency: form.paymentFrequency || null,
      annualInterestRate: form.annualInterestRate ? Number(form.annualInterestRate) : null,
      interestMethod: form.interestMethod, originatedOn: form.originatedOn || null,
      maturityDate: form.maturityDate || null, nextPaymentDate: form.nextPaymentDate || null,
      status: form.status, termsStatus: form.termsStatus, isPersonal: form.isPersonal,
      notes: form.notes || null,
    });
    if (result.error) return toast.error(result.error);
    toast.success(loan ? "Loan updated" : "Loan added"); setOpen(false); startTransition(() => router.refresh());
  }
  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setForm(initial); }}><DialogTrigger render={<Button size={loan ? "icon-sm" : "sm"} variant={loan ? "ghost" : "default"} />}>{loan ? <><Pencil /><span className="sr-only">Edit loan</span></> : <><Plus />Add loan</>}</DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{loan ? "Edit loan" : "Add loan"}</DialogTitle><DialogDescription>{revolving ? "Enter the revolving credit limit, amount currently drawn, and minimum payment." : "Enter the liability balance and terms used to split payments and project payoff."}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="Loan name"><Input value={form.name} onChange={(e) => field("name", e.target.value)} /></Field><Field label="Lender"><Input value={form.lenderName} onChange={(e) => field("lenderName", e.target.value)} /></Field><Field label="Liability account"><select className="h-9 w-full rounded-md border bg-background px-3" value={form.bookkeepingAccountId} onChange={(e) => field("bookkeepingAccountId", e.target.value)}><option value="">Choose account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field><Field label="Loan type"><select className="h-9 w-full rounded-md border bg-background px-3" value={form.loanType} onChange={(e) => { const value = e.target.value; setForm((current) => ({ ...current, loanType: value, interestMethod: value === "line_of_credit" ? "revolving" : current.interestMethod })); }}>{["term_loan","line_of_credit","equipment","vehicle","related_party","merchant_advance","other"].map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></Field>{revolving ? <Field label="Credit limit"><Input inputMode="decimal" placeholder="Maximum available credit" value={form.creditLimit} onChange={(e) => field("creditLimit", e.target.value)} /></Field> : <Field label="Original principal"><Input inputMode="decimal" value={form.originalPrincipal} onChange={(e) => field("originalPrincipal", e.target.value)} /></Field>}<Field label={revolving ? "Currently drawn" : "Current balance"}><Input inputMode="decimal" value={form.currentBalance} onChange={(e) => field("currentBalance", e.target.value)} /></Field><Field label={revolving ? "Minimum payment" : "Payment amount"}><Input inputMode="decimal" value={form.scheduledPayment} onChange={(e) => field("scheduledPayment", e.target.value)} /></Field><Field label="Frequency"><select className="h-9 w-full rounded-md border bg-background px-3" value={form.paymentFrequency} onChange={(e) => field("paymentFrequency", e.target.value)}><option value="">Unknown</option>{["weekly","biweekly","semimonthly","monthly","irregular"].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="APR"><Input inputMode="decimal" placeholder="e.g. 8.25" value={form.annualInterestRate} onChange={(e) => field("annualInterestRate", e.target.value)} /></Field><Field label="Interest method"><select className="h-9 w-full rounded-md border bg-background px-3" value={form.interestMethod} onChange={(e) => field("interestMethod", e.target.value)} disabled={revolving}>{["amortizing","fixed_fee","interest_free","revolving","unknown"].map((v) => <option key={v}>{v.replaceAll("_", " ")}</option>)}</select></Field>{!revolving && <><Field label="Originated"><Input type="date" value={form.originatedOn} onChange={(e) => field("originatedOn", e.target.value)} /></Field><Field label="Maturity"><Input type="date" value={form.maturityDate} onChange={(e) => field("maturityDate", e.target.value)} /></Field></>}<Field label="Account reference"><Input value={form.accountReference} onChange={(e) => field("accountReference", e.target.value)} /></Field><Field label="Terms status"><select className="h-9 w-full rounded-md border bg-background px-3" value={form.termsStatus} onChange={(e) => field("termsStatus", e.target.value)}>{["needs_terms","partial","verified"].map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPersonal} onChange={(e) => field("isPersonal", e.target.checked)} /> Personal obligation</label><Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => field("notes", e.target.value)} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} disabled={pending || !form.name || !form.lenderName || !form.bookkeepingAccountId}>{loan ? "Save changes" : "Add loan"}</Button></DialogFooter></DialogContent></Dialog>;
}

function formState(loan: FinancialLoan | undefined, fallbackAccount: string) { return { bookkeepingAccountId: loan?.bookkeepingAccountId ?? fallbackAccount, name: loan?.name ?? "", lenderName: loan?.lenderName ?? "", loanType: loan?.loanType ?? "term_loan", accountReference: loan?.accountReference ?? "", originalPrincipal: dollars(loan?.originalPrincipalCents), creditLimit: dollars(loan?.creditLimitCents), currentBalance: dollars(loan?.currentBalanceCents ?? 0), scheduledPayment: dollars(loan?.scheduledPaymentCents), paymentFrequency: loan?.paymentFrequency ?? "monthly", annualInterestRate: loan?.annualInterestRate?.toString() ?? "", interestMethod: loan?.interestMethod ?? "unknown", originatedOn: loan?.originatedOn ?? "", maturityDate: loan?.maturityDate ?? "", nextPaymentDate: loan?.nextPaymentDate ?? "", status: loan?.status ?? "active", termsStatus: loan?.termsStatus ?? "needs_terms", isPersonal: loan?.isPersonal ?? false, notes: loan?.notes ?? "" }; }
function Summary({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) { return <div className="border-b px-4 py-4 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-1 text-xl font-semibold tabular-nums", warning && "text-amber-700")}>{value}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium capitalize">{value}</dd></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-md border bg-background p-2"><p className="text-muted-foreground">{label}</p><p className="mt-1 font-medium tabular-nums">{value}</p></div>; }
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) { return <label className={cn("space-y-1.5 text-xs font-medium", className)}><span>{label}</span>{children}</label>; }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function dollars(value: number | null | undefined) { return value === null || value === undefined ? "" : (value / 100).toFixed(2); }
function cents(value: string) { const amount = Number(value); return value.trim() && Number.isFinite(amount) ? Math.round(amount * 100) : null; }
function dateLabel(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function frequencyLabel(value: string | null) { return value ? value.replace("semimonthly", "twice monthly") : "terms needed"; }
function termsLabel(value: FinancialLoan["termsStatus"]) { return value === "verified" ? "Terms verified" : value === "partial" ? "Partial terms" : "Terms needed"; }
function isLineOfCredit(loan: Pick<FinancialLoan, "loanType">) { return loan.loanType === "line_of_credit"; }
function utilizationColor(value: number) { return value > 90 ? "bg-rose-600" : value > 70 ? "bg-amber-600" : "bg-sky-600"; }
