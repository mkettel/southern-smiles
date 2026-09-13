import test from "node:test";
import assert from "node:assert/strict";
import { applyQuickBooksBaseline, validateQuickBooksBaseline } from "./quickbooks-baseline";

function fixture() {
  const entry = (id: string, entry_date: string) => ({id,entry_date,practice_id:"p",status:"posted",description:null,memo:null,source_type:"quickbooks_baseline",source_transaction_id:null});
  const line = (id: string, entry: string, account: string, debit: number, credit: number) => ({id,practice_id:"p",journal_entry_id:entry,bookkeeping_account_id:account,financial_account_id:null,debit_cents:debit,credit_cents:credit,memo:null});
  return {version:1,practiceId:"p",from:"2026-01-01",through:"2026-08-31",openingDate:"2025-12-31",sourceSha256:"a".repeat(64),expectedEntryCount:2,expectedLineCount:4,
    entries:[entry("opening","2025-12-31"),entry("sale","2026-08-01")],
    lines:[line("1","opening","qb:bank",100,0),line("2","opening","qb:equity",0,100),line("3","sale","qb:bank",50,0),line("4","sale","qb:income",0,50)],
    bookkeepingAccounts:[{id:"qb:bank",name:"Bank",account_type:"Bank",is_active:true},{id:"qb:equity",name:"Equity",account_type:"Equity",is_active:true},{id:"qb:income",name:"Income",account_type:"Income",is_active:true}],financialAccounts:[],
    closingBalances:{"qb:bank":150,"qb:equity":-100,"qb:income":-50}};
}
test("validates the complete ledger against closing balances",()=>assert.equal(validateQuickBooksBaseline(fixture(),"p").extract.journal.length,2));
test("replaces historical report rows without mutating Board data or September",()=>{
  const rows=[{transaction_date:"2026-08-05",amount_cents:-999,bookkeeping_account_id:"board"},{transaction_date:"2026-09-01",amount_cents:-7,bookkeeping_account_id:"board"}];
  const result=applyQuickBooksBaseline(fixture(),"p",[],rows);
  assert.equal(rows.length,2);assert.equal(result.transactions.length,3);
  assert.equal(result.transactions[0].amount_cents,-7);
  assert.ok(!result.transactions.some(r=>r.amount_cents===-999));
});
test("rejects incomplete lines",()=>{const f=fixture();f.lines.pop();assert.throws(()=>validateQuickBooksBaseline(f,"p"),/Incomplete/);});
test("rejects balanced omissions even when counts are adjusted",()=>{const f=fixture();f.lines=f.lines.slice(0,2);f.entries=f.entries.slice(0,1);f.expectedEntryCount=1;f.expectedLineCount=2;assert.throws(()=>validateQuickBooksBaseline(f,"p"),/closing balance/);});
test("rejects foreign practice",()=>assert.throws(()=>validateQuickBooksBaseline(fixture(),"other"),/Cross-practice/));
test("rejects entries outside baseline dates",()=>{const f=fixture();f.entries[1].entry_date="2026-09-01";assert.throws(()=>validateQuickBooksBaseline(f,"p"),/outside/);});
test("rejects unbalanced entries",()=>{const f=fixture();f.lines[3].credit_cents=51;assert.throws(()=>validateQuickBooksBaseline(f,"p"),/Unbalanced/);});
