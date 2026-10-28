import assert from "node:assert/strict";
import test from "node:test";
import { buildFinancialReportsData } from "./financial-reports";

test("snapshot weekly totals match the monthly report including credits and other expenses", () => {
  const accounts = [{id:"i",name:"Income",accountType:"Income"},{id:"e",name:"Interest",accountType:"Other Expense"}].map(a=>({...a,accountNumber:null,detailType:null,externalSource:"manual" as const}));
  const transactions = [{transaction_date:"2026-10-02",amount_cents:-10000,bookkeeping_account_id:"i"},{transaction_date:"2026-10-08",amount_cents:12000,bookkeeping_account_id:"e"},{transaction_date:"2026-10-27",amount_cents:-1000,bookkeeping_account_id:"e"},{transaction_date:"2026-10-29",amount_cents:-50000,bookkeeping_account_id:"i"}];
  const report = buildFinancialReportsData({accounts,transactions,now:new Date("2026-10-28T05:00:00Z")}).periods.find(p=>p.key==="month:2026-10")!;
  assert.equal(report.netIncomeCents,-1000);
  assert.equal(report.weeklyTrend?.length,5);
  assert.equal(report.weeklyTrend?.at(-1)?.revenueCents,report.revenueCents);
  assert.equal(report.weeklyTrend?.at(-1)?.expenseCents,report.expenseCents);
  assert.match(report.weeklyTrend!.at(-1)!.label,/Oct 27/);
});
