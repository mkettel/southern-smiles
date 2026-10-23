"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CheckCheck, Clock3, CreditCard, FileText, Loader2, Undo2 } from "lucide-react";
import { transactionDisplayName, type FinancialTransaction, type BookkeepingAccount } from "@/lib/financial-transactions";
import { needsBookkeepingReview } from "@/lib/financial-review-status";
import { cn } from "@/lib/utils";

type Props = {
  transactions: FinancialTransaction[];
  accounts: BookkeepingAccount[];
  categories: Record<string, string>;
  disabled: boolean;
  accountLabel: (transaction: FinancialTransaction) => string;
  requiresDetails: (transaction: FinancialTransaction) => boolean;
  onCategory: (id: string, category: string) => void;
  onApprove: (transaction: FinancialTransaction) => Promise<boolean>;
  onDetails: (transaction: FinancialTransaction) => void;
};

export function MobileReview(props: Props) {
  const [waiting, setWaiting] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [staged, setStaged] = useState<FinancialTransaction | null>(null);
  const [seconds, setSeconds] = useState(5);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState(0);
  const [message, setMessage] = useState("");
  const origin = useRef<{ x: number; y: number } | null>(null);
  const offset = useRef(0);
  const lock = useRef(false);
  const approve = useRef(props.onApprove);
  const pending = props.transactions.filter(t => t.pending);
  const reviewable = props.transactions.filter(needsBookkeepingReview);
  const queue = reviewable.filter(t => !skipped.includes(t.id));
  const current = queue[0];
  const busy = saving || props.disabled || !!staged;
  const category = current ? props.categories[current.id] : "";
  const details = current ? props.requiresDetails(current) : false;
  const currency = (t: FinancialTransaction) => new Intl.NumberFormat("en-US", { style: "currency", currency: t.currency_code || "USD" }).format(Math.abs(t.amount_cents) / 100);

  // Undo cancels an unsent approval; never pretend to reverse a posted journal locally.
  useEffect(() => {
    if (!staged) return;
    const viewport = window.matchMedia("(min-width: 768px)");
    const cancelOnDesktop = () => {
      if (viewport.matches) { clearTimeout(timer); setStaged(null); lock.current = false; }
    };
    const interval = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const saved = await approve.current(staged);
        setMessage(saved ? `${transactionDisplayName(staged)} approved` : "Not saved. Please review and try again.");
      } catch {
        setMessage("Could not confirm approval. Refresh before trying again.");
      } finally {
        setSaving(false);
        setStaged(null);
        lock.current = false;
      }
    }, 5000);
    viewport.addEventListener("change", cancelOnDesktop);
    return () => { clearInterval(interval); clearTimeout(timer); viewport.removeEventListener("change", cancelOnDesktop); };
  }, [staged]);

  function act(direction: "approve" | "skip") {
    setDrag(0);
    offset.current = 0;
    if (!current || busy || lock.current) return;
    if (direction === "skip") {
      setSkipped(ids => [...ids, current.id]);
      setMessage(`${transactionDisplayName(current)} saved for later`);
    } else if (details || !category) {
      props.onDetails(current);
    } else {
      lock.current = true;
      approve.current = props.onApprove;
      setSeconds(5);
      setMessage("");
      setStaged(current);
    }
  }
  function undo() {
    if (saving || props.disabled) return;
    if (staged) { setStaged(null); lock.current = false; setMessage("Approval cancelled"); }
    else { setSkipped(ids => ids.slice(0, -1)); setMessage("Skipped transaction restored"); }
  }

  return <section className="min-w-0 md:hidden" aria-label="Swipe transaction review">
    <div className="mb-5 flex border-b text-sm">
      <button disabled={busy} onClick={() => setWaiting(false)} className={cn("min-h-11 flex-1 border-b-2 px-2", !waiting ? "border-emerald-700 text-emerald-700" : "border-transparent text-muted-foreground")}>To review · {reviewable.length}</button>
      <button disabled={busy} onClick={() => setWaiting(true)} className={cn("flex min-h-11 flex-1 items-center justify-center gap-2 border-b-2 px-2", waiting ? "border-emerald-700 text-emerald-700" : "border-transparent text-muted-foreground")}><Clock3 size={15}/>Waiting · {pending.length}</button>
    </div>
    {waiting ? <div className="space-y-3"><h3 className="text-sm font-medium">Waiting for bank to settle</h3>{pending.map(t => <div className="flex items-center gap-3 border-b py-4" key={t.id}><Clock3 className="shrink-0 text-muted-foreground" size={20}/><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{transactionDisplayName(t)}</p><p className="text-xs text-muted-foreground">{props.accountLabel(t)}</p></div><span className="text-sm tabular-nums">{currency(t)}</span></div>)}{!pending.length && <p className="py-8 text-center text-sm text-muted-foreground">No pending bank transactions.</p>}</div> : <>
      <p className="mb-3 text-xs text-muted-foreground">{queue.length} remaining{skipped.length > 0 && ` · ${skipped.length} skipped`}</p>
      {current ? <>
        <div className="overflow-hidden px-1 pb-3">
          <article key={current.id} className="relative touch-pan-y rounded-lg border bg-background p-5 shadow-sm motion-safe:transition-transform" style={{ transform: `translateX(${drag}px) rotate(${drag / 25}deg)` }}
            onPointerDown={e => { if (busy || (e.target as HTMLElement).closest("button,select,input,label")) return; origin.current = {x:e.clientX,y:e.clientY}; offset.current = 0; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={e => { if (!origin.current) return; const dx=e.clientX-origin.current.x; const dy=e.clientY-origin.current.y; if(Math.abs(dy)>Math.abs(dx) && Math.abs(dy)>15){origin.current=null;offset.current=0;setDrag(0);return;} offset.current=dx;setDrag(Math.max(-150,Math.min(150,dx))); }}
            onPointerUp={() => { if(!origin.current)return; origin.current=null; const dx=offset.current; if(Math.abs(dx)>100)act(dx>0?"approve":"skip");else setDrag(0); }}
            onPointerCancel={() => {origin.current=null;offset.current=0;setDrag(0);}}>
            {Math.abs(drag)>35 && <div className={cn("pointer-events-none absolute inset-x-6 top-16 z-10 rounded-md border-2 bg-background p-2 text-center font-bold",drag>0?"border-emerald-600 text-emerald-700":"border-sky-600 text-sky-700")}>{drag>0 ? details || !category ? "REVIEW DETAILS" : "APPROVE" : "SKIP"}</div>}
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><time>{current.transaction_date}</time><button disabled={busy} className="flex min-h-11 items-center gap-1" onClick={() => props.onDetails(current)}>Details <ArrowRight size={14}/></button></div>
            <div className="mx-auto my-4 grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CreditCard size={27}/></div>
            <h3 className="break-words text-center text-xl font-semibold">{transactionDisplayName(current)}</h3>
            <p className="my-3 break-all text-center text-4xl font-semibold tabular-nums">{current.amount_cents < 0 ? "+" : "−"}{currency(current)}</p>
            <p className="text-center text-xs text-muted-foreground">{props.accountLabel(current)}</p>
            <div className="mt-6 border-t pt-4"><label htmlFor="mobile-category" className="text-xs text-muted-foreground">{details ? "Transaction type" : "Category"}</label>
              {details ? <button disabled={busy} onClick={() => props.onDetails(current)} className="mt-2 flex min-h-12 w-full items-center justify-between rounded-md border p-3 text-sm">Review transfer or loan <ArrowRight size={17}/></button> : <select id="mobile-category" aria-label="Mobile category" disabled={busy} className="mt-2 min-h-12 w-full min-w-0 rounded-md border bg-muted/20 px-3 text-sm" value={category || ""} onChange={e => props.onCategory(current.id,e.target.value)}><option value="">Choose a category</option>{props.accounts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} {a.name}</option>)}</select>}
            </div>
          </article>
        </div>
        <div className="flex gap-2"><button aria-label="Undo last action" title="Undo last action" disabled={saving || props.disabled || (!staged && !skipped.length)} onClick={undo} className="grid min-h-12 w-12 shrink-0 place-items-center rounded-md border disabled:opacity-40"><Undo2 size={20}/></button><button disabled={busy} onClick={() => act("skip")} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md border text-sm disabled:opacity-40"><ArrowRight size={20}/>Skip</button><button disabled={busy} onClick={() => act("approve")} className="flex min-h-12 flex-[1.5] items-center justify-center gap-2 rounded-md bg-emerald-700 px-2 text-sm text-white disabled:opacity-40">{saving?<Loader2 className="animate-spin" size={20}/>:details||!category?<FileText size={20}/>:<Check size={20}/>} {details||!category?"Review":"Approve"}</button></div>
      </> : <div className="flex min-h-72 flex-col items-center justify-center gap-4 text-center"><CheckCheck className="text-emerald-700" size={38}/><h3 className="text-xl font-semibold">{skipped.length ? "Review round complete" : "All caught up"}</h3>{skipped.length>0 && <button className="min-h-12 rounded-md border px-5 text-sm" onClick={() => setSkipped([])}>Review skipped ({skipped.length})</button>}</div>}
      <div className="mt-3 min-h-12 text-center text-sm" role="status">{staged ? <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-50 p-3 text-emerald-900"><span>{saving?"Saving approval…":`Posting in ${seconds}s`}</span><button disabled={saving} onClick={undo} className="min-h-11 px-3 font-medium disabled:opacity-40">Undo</button></div> : message}</div>
    </>}
  </section>;
}
