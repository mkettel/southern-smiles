import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as cashFlow from "./financial-cash-flow";
import * as workspace from "./financial-workspace";

test("cash flow scopes every query to the authorized practice and only included USD bank accounts", async () => {
  const queries: Array<{table:string; calls:unknown[][]}> = [];
  const exports: {getFinancialCashFlowData?: (month:string)=>Promise<cashFlow.CashFlowData>} = {};
  const source = readFileSync(new URL("../actions/financial-cash-flow.ts", import.meta.url),"utf8");
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
    exports, Date, Map, Number, Promise,
    require(id:string) {
      if(id === "@/lib/financial-cash-flow") return cashFlow;
      if(id === "@/lib/financial-workspace") return workspace;
      if(id === "@/actions/member-module-access") return {requireMemberModuleAccess: async (key:string)=> {
        assert.equal(key,"financial");
        return {practiceId:"authorized-practice",supabase:{from(table:string){
          const q = {table,calls:[] as unknown[][]}; queries.push(q);
          const result = table === "financial_accounts" ? {data:[{id:"usd-bank",name:"Checking",currency_code:"USD"},{id:"eur-bank",name:"Foreign",currency_code:"EUR"}]} : table === "accounting_journal_entries" ? {data:{entry_date:"2026-09-01"}} : table === "financial_transactions" ? {count:2} : {data:[]};
          const builder: object = new Proxy({}, {get(_,method){if(method === "then") return (resolve:(v:unknown)=>void)=>resolve(result);return (...args:unknown[])=>{q.calls.push([method,...args]);return builder;};}});
          return builder;
        }}};
      }};
      throw new Error(`Unexpected import ${id}`);
    },
  });
  const result = await exports.getFinancialCashFlowData!("2026-09");
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
