import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { FinancialCashFlowDashboard } from "@/components/financial/financial-cash-flow-dashboard";
import { buildCashFlowReport, type CashFlowData, type CashFlowLine } from "@/lib/financial-cash-flow";

function PreviewChrome({ children }: {title: string; children: React.ReactNode}) {
  return <div className="flex min-w-0 flex-1 flex-col"><header className="flex h-16 shrink-0 items-center justify-end border-b px-6 text-sm text-muted-foreground">Southern Smiles · Sample data</header><main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main></div>;
}

export default function CashFlowPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const months = [{key:"2026-10",label:"October 2026"},{key:"2026-09",label:"September 2026"},{key:"2026-08",label:"August 2026"}];
  const fixtures: CashFlowData[] = months.map(({key}) => {
    const lines: CashFlowLine[] = key === "2026-08" ? [] : [2,8,15,22,28].flatMap((day,i) => {
      if (key === "2026-10" && day > 27) return [];
      return [{name:"Patient collections",amount:[12000,20000,18000,22000,8000][i]}, {name:"Payroll",amount:-[9000,11000,8000,14000,4000][i]}, {name:"Card payment",amount:-[4500,4500,4500,5500,2500][i]}, {name:"Loan payment",amount:-1500}].map((a,j) => ({id:`${key}-${i}-${j}`,entryId:`${key}-${i}-${j}`,date:`${key}-${String(day).padStart(2,"0")}`,description:a.name,account:"Business checking ·2625",debitCents:Math.max(0,a.amount*100),creditCents:Math.max(0,-a.amount*100),status:"posted",sourceType:"bank_transaction"}));
    });
    return {report:buildCashFlowReport(key,lines,"2026-10-27"),months,accountNames:["Business Income ·2625","Monthly Bills ·9777","Specialists Fund ·6356","Equipments ·9664","Business Profit ·6791"],unpostedCount:12,settlingCount:2,unsupportedCurrencyCount:0};
  });
  return <div className="flex h-screen overflow-hidden bg-background"><Sidebar role="admin" practiceName="Southern Smiles" /><PreviewChrome title="Financial"><div className="mx-auto w-full max-w-[1500px] [font-family:var(--font-geist-sans)]"><header className="mb-8 border-b"><h1 className="text-2xl font-semibold">Financial</h1><nav aria-label="Financial workspace" className="mt-5 flex gap-7 overflow-x-auto">{["Overview","Bookkeeping","Rules","Chart of accounts","Loans","Reports","Cash flow","Connections"].map(label => <span key={label} className={`shrink-0 pb-3 text-sm ${label === "Cash flow" ? "border-b-2 border-emerald-600 font-medium" : "text-muted-foreground"}`}>{label}</span>)}</nav></header><FinancialCashFlowDashboard initialData={fixtures[1]} previewMonths={fixtures} /></div></PreviewChrome></div>;
}
