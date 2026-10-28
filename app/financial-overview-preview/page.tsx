import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { FinancialOverviewDashboard } from "@/components/financial/financial-overview-dashboard";
import { buildFinancialReportsData } from "@/lib/financial-reports";
import { buildCashFlowReport, type CashFlowData } from "@/lib/financial-cash-flow";
import type { FinancialWorkspaceData } from "@/lib/financial-workspace";

export default function OverviewPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const accounts = [{id:"income",name:"Fee for Service Income",accountType:"Income",accountNumber:null,detailType:null,externalSource:"manual" as const},{id:"expense",name:"Operating expenses",accountType:"Expenses",accountNumber:null,detailType:null,externalSource:"manual" as const}];
  const transactions = ["2026-09","2026-10"].flatMap(month => [2,8,15,22,27].flatMap((day,i) => [
    {transaction_date:`${month}-${String(day).padStart(2,"0")}`,amount_cents:-[2000000,800000,700000,1000000,900000][i],bookkeeping_account_id:"income"},
    {transaction_date:`${month}-${String(day).padStart(2,"0")}`,amount_cents:[1200000,400000,600000,600000,600000][i] * (month === "2026-09" ? 2 : 1),bookkeeping_account_id:"expense"},
  ]));
  const reports = buildFinancialReportsData({accounts,transactions,now:new Date("2026-10-28T05:00:00Z")});
  const months = ["2026-08","2026-09","2026-10"].map((key,i) => ({key,label:["Aug","Sep","Oct"][i],longLabel:["August 2026","September 2026","October 2026"][i],dateRange:key,revenueCents:0,expenseCents:0,pendingCount:[0,42,18][i],possibleTransferCount:[0,10,6][i],settlingCount:[0,0,4][i],recentActivity:i===0?[]:[{id:key,date:`${key}-23`,description:"Worldpay",category:"Income",account:"Fee for Service Income",amountCents:-115600,reviewStatus:"reviewed" as const,categorySource:"manual" as const},{id:`${key}-2`,date:`${key}-23`,description:"ADP Payroll Fees",category:"Expenses",account:"Payroll Service Fees",amountCents:6795,reviewStatus:"pending" as const,categorySource:"manual" as const}]}));
  const cash: CashFlowData[] = months.map(({key}) => ({report:buildCashFlowReport(key,key==="2026-08"?[]:[{id:key,entryId:key,date:`${key}-22`,description:"Sample bank activity",account:"Checking",debitCents:key==="2026-10"?600000:0,creditCents:key==="2026-09"?300000:0,status:"posted",sourceType:"bank_transaction"}],"2026-10-27"),months:months.map(m=>({key:m.key,label:m.longLabel})),accountNames:["Checking"],unpostedCount:12,settlingCount:4,unsupportedCurrencyCount:0}));
  const data: FinancialWorkspaceData = {monthLabel:"October 2026",monthDateRange:"October",revenueCents:0,expenseCents:0,netIncomeCents:0,pendingCount:60,possibleTransferCount:16,overdueBillCount:2,connectedInstitutionCount:1,includedBankAccountCount:1,lastSyncedAt:"2026-10-28T05:00:00Z",months,recentActivity:[],expenseBreakdown:[],accounts,rules:[],autoRules:[]};
  return <div className="flex h-screen overflow-hidden bg-background"><Sidebar role="admin" practiceName="Southern Smiles" /><div className="min-w-0 flex-1 overflow-y-auto"><header className="flex h-16 items-center justify-end border-b px-6 text-sm text-muted-foreground">Southern Smiles · Sample data</header><main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8 [font-family:var(--font-geist-sans)]"><header className="mb-6 border-b"><h1 className="text-2xl font-semibold">Financial</h1><nav aria-label="Financial workspace" className="mt-5 flex gap-7 overflow-x-auto">{["Overview","Bookkeeping","Rules","Chart of accounts","Loans","Reports","Cash flow","Connections"].map(label=><a key={label} href={label==="Cash flow"?"/financial-cash-flow-preview":"/admin/financial"} className={`shrink-0 pb-3 text-sm ${label==="Overview"?"border-b-2 border-emerald-600 font-medium":"text-muted-foreground"}`}>{label}</a>)}</nav></header><FinancialOverviewDashboard data={data} reports={reports} initialCash={cash[2]} previewCash={cash} /></main></div></div>;
}
