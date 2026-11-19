import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as cashFlow from "./financial-cash-flow";
import * as workspace from "./financial-workspace";
import * as baseline from "./quickbooks-baseline";

async function runReport(month: string, document?: baseline.QuickBooksBaseline) {
  const practiceId = document?.practiceId ?? "authorized-practice";
  const queries: Array<{table:string; calls:unknown[][]}> = [];
  const exports: {getFinancialCashFlowData?: (month:string)=>Promise<cashFlow.CashFlowData>} = {};
  const source = readFileSync(new URL("../actions/financial-cash-flow.ts", import.meta.url),"utf8");
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
    exports, Date, Map, Number, Promise,
    require(id:string) {
      if(id === "@/lib/financial-cash-flow") return cashFlow;
      if(id === "@/lib/financial-workspace") return workspace;
      if(id === "@/lib/quickbooks-baseline") return baseline;
      if(id === "@/actions/member-module-access") return {requireMemberModuleAccess: async (key:string)=> {
        assert.equal(key,"financial");
        return {practiceId,supabase:{from(table:string){
          const q = {table,calls:[] as unknown[][]}; queries.push(q);
          const result = table === "accounting_source_baselines" ? {data: document ? {document} : null} : table === "financial_accounts" ? {data: document ? ["6791","2625","9664","9777","6356"].map(mask=>({id:mask,mask,name:mask,currency_code:"USD"})) : [{id:"usd-bank",name:"Checking",currency_code:"USD"},{id:"eur-bank",name:"Foreign",currency_code:"EUR"}]} : table === "accounting_journal_entries" ? {data:{entry_date:"2026-09-01"}} : table === "financial_transactions" ? {count:2} : {data:[]};
          const builder: object = new Proxy({}, {get(_,method){if(method === "then") return (resolve:(v:unknown)=>void)=>resolve(result);return (...args:unknown[])=>{q.calls.push([method,...args]);return builder;};}});
          return builder;
        }}};
      }};
      throw new Error(`Unexpected import ${id}`);
    },
  });
  return {result: await exports.getFinancialCashFlowData!(month), queries};
}

test("verified historical cash ties to the five August trial balances without counting Board duplicates", {skip: !process.env.CASH_BASELINE_FIXTURE}, async () => {
  const document = JSON.parse(readFileSync(process.env.CASH_BASELINE_FIXTURE!, "utf8"));
  const { result, queries } = await runReport("all", document);
  assert.equal(result.report.netCents, 695878);
  for (const table of ["financial_transactions","accounting_journal_lines"]) {
    assert.ok(queries.filter(q=>q.table===table).every(q=>q.calls.some(c=>c[0]==="gte" && c[2]==="2026-09-01")));
  }
});

test("cash flow scopes every query to the authorized practice and only included USD bank accounts", async () => {
  const {result, queries} = await runReport("2026-09");
  assert.equal(result.unsupportedCurrencyCount,1);
  assert.equal(result.unpostedCount,2);
  assert.equal(result.report.netCents,0);
  for(const q of queries) assert.ok(q.calls.some(c=>c[0]==="eq"&&c[1]==="practice_id"&&c[2]==="authorized-practice"));
  const accounts = queries.find(q=>q.table === "financial_accounts")!;
  assert.ok(accounts.calls.some(c=>c[1]==="account_type"&&c[2]==="depository"));
  assert.ok(accounts.calls.some(c=>c[1]==="included_in_bookkeeping"&&c[2]===true));
  const lines = queries.find(q=>q.table === "accounting_journal_lines")!;
  assert.ok(lines.calls.some(c=>c[1]==="accounting_journal_entries.practice_id"));
  assert.deepEqual(lines.calls.find(c=>c[0]==="in")?.[2],["usd-bank"]);
  assert.ok(lines.calls.some(c=>c[0]==="range"&&c[1]===0&&c[2]===999));
});
