"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, Building2, Check, Flag, Gift, Pencil, Plus, Settings2, Target, Trophy, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { changeSurvivalGame, loadSurvivalGame } from "@/actions/survival-game";
import { type Game, type Reward, type Request, type Command, eligible } from "@/lib/survival-game";

const inputClass = "mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm";
function percentage(game: Game) { return Math.min(100, Math.max(0, game.current / game.goal * 100)); }
function dateLabel(date: string) { return date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No deadline"; }

export function GamesWorkspace({ initial }: { initial: Awaited<ReturnType<typeof loadSurvivalGame>> }) {
  const [data, setData] = useState(initial.data);
  const [version, setVersion] = useState(initial.version);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const isAdmin = initial.actor.role === "admin";
  const person = initial.actor.id;
  const people = initial.players.map(p => p.id);
  const name = (id: string) => initial.players.find(p => p.id === id)?.full_name ?? "Former participant";
  const base: Game = { id: "", title: "", detail: "", audience: "Office", members: people, kind: "Reach a goal", unit: "", current: 0, goal: 1, start: new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" }), end: "", repeat: false, points: 0, verification: "Trusted updates", archived: false, completed: false, sides: ["Front office", "Back office"], scores: [0,0] };
  const [admin, setAdmin] = useState(false);
  const [view, setView] = useState("My Games");
  const [adminTab, setAdminTab] = useState("Games");
  const [draft, setDraft] = useState<Game | null>(null);
  const [rewardDraft, setRewardDraft] = useState<Reward | null>(null);
  const [submission, setSubmission] = useState<Game | null>(null);
  const [historyGame, setHistoryGame] = useState<Game | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    if (busy || draft || rewardDraft || submission) return;
    let active = true;
    const refresh = async () => {
      try { const result = await loadSurvivalGame(); if (active && !saving.current) { setData(result.data); setVersion(result.version); } } catch { /* Keep the last confirmed state until the next refresh. */ }
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [busy, draft, rewardDraft, submission]);

  async function commit(command: Command) {
    if (saving.current) return false;
    saving.current = true; setBusy(true);
    try {
      const result = await changeSurvivalGame(command, version);
      if (!result.success) { toast.error(result.error); return false; }
      setData(result.data); setVersion(result.version);
      toast.success("Saved");
      return true;
    } catch { toast.error("Could not save. Check your connection and try again."); return false; }
    finally { saving.current = false; setBusy(false); }
  }
  const pending = data.requests.filter(r => r.status === "pending");
  const active = data.games.filter(g => !g.archived);
  const mine = active.filter(g => g.members.includes(person));
  const visible = (view === "My Games" ? mine : active.filter(g => g.audience === (view === "Office" ? "Office" : "Team")));
  const balance = data.balances[person] ?? 0;

  async function submitProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submission) return;
    const values = new FormData(event.currentTarget);
    const ok = await commit({ type: "progress", id: submission.id, before: submission.current, value: Number(values.get("value")), note: String(values.get("note") ?? "") });
    if (ok) setSubmission(null);
  }
  async function saveGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (await commit({ type: "saveGame", game: { ...draft, id: draft.id || crypto.randomUUID() } })) setDraft(null);
  }
  async function decide(request: Request, approve: boolean) { await commit({ type: "decide", id: request.id, approve }); }
  async function finish(game: Game) { await commit({ type: "finish", id: game.id }); }

  return <fieldset disabled={busy} className="mx-auto max-w-7xl space-y-6 pb-12">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
      <div><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Flag className="size-4 text-emerald-600" /> {initial.practiceName}</div><h1 className="text-2xl font-bold">{admin ? "Manage Survival Game" : "Survival Game"}</h1><p className="mt-1 text-sm text-muted-foreground">{admin ? "Games, participants, and approvals" : "Your next win is close."}</p></div>
      <div className="flex flex-wrap items-center gap-3">{!admin && <span className="text-sm font-semibold">{balance.toLocaleString()} points</span>}{isAdmin && <Button variant={admin ? "outline" : "default"} onClick={() => setAdmin(!admin)}>{admin ? <ArrowLeft /> : <Settings2 />}{admin ? "Player view" : "Manage games"}{!admin && pending.length > 0 && <span className="rounded bg-white/20 px-1.5">{pending.length}</span>}</Button>}</div>
    </header>
    {admin ? <>
      <nav className="flex gap-5 overflow-x-auto border-b">{["Games", "Approvals", "Rewards", "Activity"].map(t => <button key={t} onClick={() => setAdminTab(t)} className={cn("shrink-0 border-b-2 px-1 py-3 text-sm", adminTab === t ? "border-emerald-600 font-semibold" : "border-transparent text-muted-foreground")}>{t}{t === "Approvals" ? ` (${pending.length})` : ""}</button>)}</nav>
      {adminTab === "Games" && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Show archived</label><Button onClick={() => setDraft({ ...base, members: [...people] })}><Plus />Create game</Button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr>{["Game", "Participants", "Progress", "Ends", "Status", ""].map((s,i) => <th key={i} className="px-3 py-3 font-medium">{s}</th>)}</tr></thead><tbody>{data.games.filter(g => showArchived || !g.archived).map(g => <tr key={g.id} className="border-b"><td className="max-w-64 px-3 py-4"><p className="font-medium">{g.title}</p><p className="text-xs text-muted-foreground">{g.kind}</p></td><td className="px-3">{g.audience}<p className="text-xs text-muted-foreground">{g.members.length} participants</p></td><td className="px-3 tabular-nums">{g.kind === "Compete" ? g.scores.join(" : ") : `${g.current} / ${g.goal}`}<p className="text-xs text-muted-foreground">{g.unit}</p></td><td className="px-3">{dateLabel(g.end)}{g.repeat && <p className="text-xs text-muted-foreground">Monthly rounds</p>}</td><td className="px-3">{g.archived ? "Archived" : g.completed ? "Completed" : "Active"}</td><td className="px-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" title="Edit game" aria-label={`Edit ${g.title}`} onClick={() => setDraft({ ...g, members: [...g.members] })}><Pencil /></Button><Button variant="ghost" size="icon-sm" title={g.archived ? "Restore game" : "Archive game"} aria-label={`${g.archived ? "Restore" : "Archive"} ${g.title}`} onClick={() => commit({ type: "archive", id: g.id, archived: !g.archived })}><Archive /></Button>{!g.completed && !g.archived && eligible(g) && <Button size="sm" onClick={() => finish(g)}><Check />Award</Button>}</div></td></tr>)}</tbody></table></div>
      </>}
      {adminTab === "Approvals" && <div className="space-y-3">{pending.length === 0 && <p className="py-12 text-center text-muted-foreground">All caught up. No pending approvals.</p>}{pending.map(r => <article key={r.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5"><div><span className="text-xs uppercase text-muted-foreground">{r.type} request</span><h2 className="mt-1 font-semibold">{r.title}</h2><p className="text-sm">{name(r.person)} <span className="text-muted-foreground">/ {r.type === "progress" ? "Proposed total" : "Reserved points"}: {r.value}</span></p><p className="mt-2 max-w-xl text-sm text-muted-foreground">{r.note}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => decide(r, false)}><X />Decline</Button><Button onClick={() => decide(r, true)}><Check />Approve</Button></div></article>)}</div>}
      {adminTab === "Rewards" && <><div className="flex justify-end"><Button onClick={() => setRewardDraft({ id: "", title: "", points: 250 })}><Plus />Add reward</Button></div>{data.rewards.map(r => <div key={r.id} className="flex items-center justify-between border-b py-4"><div className="flex items-center gap-3"><Gift className="size-5 text-rose-500" /><span>{r.title}</span><span className="text-sm text-muted-foreground">{r.points} points</span></div><Button variant="ghost" size="icon-sm" title="Edit reward" aria-label={`Edit ${r.title}`} onClick={() => setRewardDraft(r)}><Pencil /></Button></div>)}</>}
      {adminTab === "Activity" && <div>{data.history.length ? data.history.map((h,i) => <p key={i} className="border-b py-3 text-sm">{h}</p>) : <p className="py-12 text-center text-muted-foreground">No changes recorded yet.</p>}</div>}
    </> : <>
      <div className="flex flex-wrap items-center justify-between gap-4"><nav className="flex max-w-full gap-1 overflow-x-auto">{["My Games", "Teams", "Office", "Rewards"].map(t => <Button key={t} variant={view === t ? "default" : "ghost"} onClick={() => setView(t)}>{t}</Button>)}</nav><Button variant="ghost" onClick={async () => { try { const fresh = await loadSurvivalGame(); setData(fresh.data); setVersion(fresh.version); } catch { toast.error("Could not refresh games"); } }}>Refresh</Button></div>
      {view !== "Rewards" ? <>
        <div className="flex items-end justify-between border-b pb-4"><div><h2 className="text-lg font-semibold">{view === "My Games" ? `${name(person)}'s game room` : view === "Teams" ? "Better together" : "One office. Shared wins."}</h2><p className="mt-1 text-sm text-muted-foreground">{visible.length} challenges / {visible.filter(g => g.completed).length} completed</p></div><Trophy className="size-7 text-amber-500" /></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(g => <article key={g.id} className="flex min-w-0 flex-col rounded-lg border bg-card p-5"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{g.audience === "Individual" ? <Target className="size-4 text-sky-500" /> : g.audience === "Office" ? <Building2 className="size-4 text-emerald-600" /> : <Users className="size-4 text-emerald-600" />}{g.audience}</span><span className="text-xs font-semibold text-amber-700">{g.points} pts / person</span></div><h3 className="mt-4 text-lg font-semibold">{g.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{g.detail}</p>
          <div className="mt-auto pt-6">{g.kind === "Compete" ? <div className="space-y-3">{g.sides.map((side,i) => <div key={i}><div className="mb-1 flex justify-between text-xs"><span>{side}</span><strong>{g.scores[i]} {g.unit}</strong></div><div className="h-2 overflow-hidden rounded bg-muted"><div className={cn("h-full", i === 0 ? "bg-sky-500" : "bg-rose-500")} style={{ width: `${Math.min(100, g.scores[i] / g.goal * 100)}%` }} /></div></div>)}</div> : <><div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><strong className="text-xl tabular-nums">{g.kind === "Stay within a limit" ? "$" : ""}{g.current.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">/ {g.goal.toLocaleString()} {g.unit}</span></strong></div><div className="h-2 overflow-hidden rounded bg-muted"><div className={cn("h-full", g.kind === "Stay within a limit" ? (g.current > g.goal ? "bg-rose-500" : "bg-sky-500") : "bg-emerald-500")} style={{ width: `${percentage(g)}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{g.kind === "Stay within a limit" ? `${Math.abs(g.goal - g.current).toLocaleString()} ${g.current > g.goal ? "over budget" : "remaining in budget"}` : `${Math.max(0, g.goal - g.current)} to go`}</p></>}
          <div className="mt-5 flex justify-between gap-3 border-t pt-3 text-xs text-muted-foreground"><span>{g.start ? dateLabel(g.start) : "Anytime"} - {dateLabel(g.end)}</span><span>{g.repeat ? "Monthly" : g.verification}</span></div>
          <Button className="mt-4 w-full" variant="outline" disabled={!g.members.includes(person) || g.kind === "Compete" || (g.verification === "Manager entry" && !isAdmin) || (g.verification === "Manager approval" && pending.some(r => r.gameId === g.id && r.person === person))} onClick={() => setSubmission(g)}>{g.kind === "Compete" || (g.verification === "Manager entry" && !isAdmin) ? "Manager scorekeeping" : !g.members.includes(person) ? "Not participating" : g.verification === "Manager approval" && pending.some(r => r.gameId === g.id && r.person === person) ? "Awaiting approval" : <><Plus />Update progress</>}</Button><Button variant="ghost" className="mt-1 w-full" onClick={() => setHistoryGame(g)}>View history</Button></div></article>)}</div>
      </> : <><h2 className="text-lg font-semibold">Reward shelf</h2><div className="grid gap-4 md:grid-cols-2">{data.rewards.map(r => <article key={r.id} className="rounded-lg border p-5"><Gift className="size-8 text-rose-500" /><h3 className="mt-4 font-semibold">{r.title}</h3><div className="mt-5 flex items-center justify-between"><span>{r.points} points</span><Button disabled={balance < r.points} onClick={() => commit({ type: "reward", id: r.id })}>Request reward</Button></div></article>)}</div></>}
      <div className="border-t pt-5"><h2 className="mb-3 text-sm font-semibold">Your requests</h2>{data.requests.filter(r => r.person === person).length === 0 ? <p className="text-sm text-muted-foreground">No requests yet.</p> : data.requests.filter(r => r.person === person).map(r => <div key={r.id} className="flex justify-between gap-4 py-2 text-sm"><span>{r.title}</span><span className="capitalize text-muted-foreground">{r.status}</span></div>)}</div>
    </>}

    <Dialog open={!!draft} onOpenChange={open => { if (!open) setDraft(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{draft?.id ? "Edit game" : "Create game"}</DialogTitle></DialogHeader>{draft && <form onSubmit={saveGame} className="space-y-4">
      <label className="block text-sm">Game name<input required maxLength={100} className={inputClass} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label className="block text-sm">What counts as a win<textarea required maxLength={400} className={cn(inputClass, "h-20 py-2")} value={draft.detail} onChange={e => setDraft({ ...draft, detail: e.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Participants<select className={inputClass} value={draft.audience} onChange={e => setDraft({ ...draft, audience: e.target.value as Game["audience"], members: e.target.value === "Office" ? people : [] })}>{["Individual", "Team", "Office"].map(s => <option key={s}>{s}</option>)}</select></label><label className="text-sm">Way to win<select className={inputClass} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as Game["kind"] })}>{["Reach a goal", "Stay within a limit", "Build consistency", "Compete"].map(s => <option key={s}>{s}</option>)}</select></label></div>
      {draft.audience !== "Office" && <fieldset className="space-y-3 border-y py-3"><legend className="text-xs">Participants</legend><div className="flex flex-wrap gap-4">{people.map(p => <label key={p} className="flex items-center gap-2 text-sm"><input type={draft.audience === "Individual" ? "radio" : "checkbox"} name="member" checked={draft.members.includes(p)} onChange={e => setDraft({ ...draft, members: draft.audience === "Individual" ? [p] : e.target.checked ? [...draft.members,p] : draft.members.filter(m => m !== p) })} />{name(p)}</label>)}</div></fieldset>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Measurement<input required className={inputClass} placeholder="implants, reviews, dollars..." value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} /></label><label className="text-sm">{draft.kind === "Stay within a limit" ? "Budget limit" : "Goal quantity"}<input required type="number" min="0.01" step="any" className={inputClass} value={draft.goal} onChange={e => setDraft({ ...draft, goal: Number(e.target.value) })} /></label><label className="text-sm">Current total<input required type="number" min="0" step="any" className={inputClass} value={draft.current} onChange={e => setDraft({ ...draft, current: Number(e.target.value) })} /></label><label className="text-sm">Reward points per participant<input required type="number" min="0" className={inputClass} value={draft.points} onChange={e => setDraft({ ...draft, points: Number(e.target.value) })} /></label><label className="text-sm">Start date<input required type="date" className={inputClass} value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })} /></label><label className="text-sm">End date<input type="date" min={draft.start} className={inputClass} value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })} /></label></div>
      <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!draft.end} onChange={e => setDraft({ ...draft, end: e.target.checked ? "" : "2026-12-31", repeat: false })} />No end date</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!draft.end} checked={draft.repeat} onChange={e => setDraft({ ...draft, repeat: e.target.checked })} />Monthly schedule (manual reset)</label></div>
      {draft.kind === "Compete" && <fieldset className="space-y-3 border-y py-3"><legend className="text-sm">Scoreboard</legend>{draft.sides.map((s,i) => <div key={i} className="grid grid-cols-2 gap-3"><label className="text-xs">Team {i+1}<input required className={inputClass} value={s} onChange={e => setDraft({ ...draft, sides: draft.sides.map((v,j) => j === i ? e.target.value : v) })} /></label><label className="text-xs">Score {i+1}<input type="number" min="0" step="any" required className={inputClass} value={draft.scores[i]} onChange={e => setDraft({ ...draft, scores: draft.scores.map((v,j) => j === i ? Number(e.target.value) : v) })} /></label></div>)}</fieldset>}
      <label className="block text-sm">Verification<select className={inputClass} value={draft.verification} onChange={e => setDraft({ ...draft, verification: e.target.value as Game["verification"] })}><option>Trusted updates</option><option>Manager approval</option><option>Manager entry</option></select></label>
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit"><Check />Save game</Button></div>
    </form>}</DialogContent></Dialog>
    <Dialog open={!!submission} onOpenChange={open => { if (!open) setSubmission(null); }}><DialogContent><DialogHeader><DialogTitle>Update progress: {submission?.title}</DialogTitle></DialogHeader>{submission && <form className="space-y-4" onSubmit={submitProgress}><p className="text-sm text-muted-foreground">Current total: {submission.current} {submission.unit}</p><label className="block text-sm">New total ({submission.unit})<input className={inputClass} name="value" type="number" min="0" step="any" required defaultValue={submission.current} /></label><label className="block text-sm">Note (optional)<textarea className={cn(inputClass,"h-24 py-2")} name="note" maxLength={500} /></label><Button type="submit"><Check />{submission.verification === "Manager approval" ? "Submit for approval" : "Save update"}</Button></form>}</DialogContent></Dialog>
    <Dialog open={!!historyGame} onOpenChange={open => { if (!open) setHistoryGame(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{historyGame?.title}: history</DialogTitle></DialogHeader>{(data.updates ?? []).filter(u => u.gameId === historyGame?.id).length === 0 ? <p className="text-sm text-muted-foreground">No progress updates recorded yet.</p> : (data.updates ?? []).filter(u => u.gameId === historyGame?.id).map((u,i) => <div key={i} className="border-b py-3"><p className="text-sm font-medium">{name(u.person)}: {u.before} to {u.after}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(u.at).toLocaleString()}</p>{u.note && <p className="mt-2 text-sm">{u.note}</p>}</div>)}</DialogContent></Dialog>
    <Dialog open={!!rewardDraft} onOpenChange={open => { if (!open) setRewardDraft(null); }}><DialogContent><DialogHeader><DialogTitle>{rewardDraft?.id ? "Edit reward" : "Add reward"}</DialogTitle></DialogHeader>{rewardDraft && <form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (await commit({ type: "saveReward", reward: { ...rewardDraft, id: rewardDraft.id || crypto.randomUUID() } })) setRewardDraft(null); }}><label className="block text-sm">Reward name<input required className={inputClass} value={rewardDraft.title} onChange={e => setRewardDraft({ ...rewardDraft,title:e.target.value })} /></label><label className="block text-sm">Point price<input required type="number" min="1" className={inputClass} value={rewardDraft.points} onChange={e => setRewardDraft({ ...rewardDraft,points:Number(e.target.value) })} /></label><Button type="submit">Save reward</Button></form>}</DialogContent></Dialog>
  </fieldset>;
}
