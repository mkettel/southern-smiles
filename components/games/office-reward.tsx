"use client";

import { type Game, type Player, officeRewardShares } from "@/lib/survival-game";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const inputClass = "mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm";

export function OfficeRewardEditor({ game, players, onChange }: { game: Game; players: Player[]; onChange: (game: Game) => void }) {
  const reward = game.officeReward;
  const shares = reward ? officeRewardShares(reward) : {};
  const totalUnits = Object.values(reward?.units ?? {}).reduce((sum, units) => sum + units, 0);
  return <fieldset className="space-y-4 border-y py-4">
    <legend className="text-sm font-medium">Office reward</legend>
    <label className="block text-sm">Reward type<select className={inputClass} value={reward ? "cash" : "points"} onChange={e => onChange({ ...game, points: 0, officeReward: e.target.value === "cash" ? { poolCents: 0, units: Object.fromEntries(game.members.map(id => [id, 0])) } : undefined })}>
      <option value="points">Points per participant</option><option value="cash">Shared cash pool</option>
    </select></label>
    {reward && <>
      <label className="block text-sm">Total office reward ($)<input name="officePool" className={inputClass} type="number" required min="0.01" max="1000000" step="0.01" defaultValue={reward.poolCents ? reward.poolCents / 100 : ""} onChange={e => onChange({ ...game, officeReward: { ...reward, poolCents: Math.round(Number(e.target.value) * 100) } })} /></label>
      <p className="text-sm font-medium">Office bonus split</p>
      <div className="space-y-3">{game.members.map(id => <div key={id} className="grid grid-cols-[minmax(0,1fr)_5rem_6rem] items-center gap-3 text-sm">
        <label className="min-w-0 break-words" htmlFor={`bonus-${id}`}>{players.find(p => p.id === id)?.full_name ?? "Former participant"}</label>
        <input id={`bonus-${id}`} name={`bonus-${id}`} aria-label={`Bonus units for ${players.find(p => p.id === id)?.full_name ?? "Former participant"}`} type="number" min="0" max="100" step="0.5" required className="h-10 min-w-0 rounded-md border px-2" defaultValue={reward.units[id] ?? 0} onChange={e => onChange({ ...game, officeReward: { ...reward, units: { ...reward.units, [id]: Number(e.target.value) } } })} />
        <span className="text-right tabular-nums">{money(shares[id] ?? 0)}</span>
      </div>)}</div>
      <div className="flex flex-wrap justify-between gap-2 border-t pt-3 text-sm"><strong>{totalUnits} total units</strong><span>{money(totalUnits > 0 ? reward.poolCents / totalUnits : 0)} per unit</span></div>
    </>}
  </fieldset>;
}

export function OfficeRewardSummary({ game, players, awards }: { game: Game; players: Player[]; awards?: Record<string, number> }) {
  if (!game.officeReward) return null;
  const shares = awards ?? officeRewardShares(game.officeReward);
  return <details className="mt-4 border-t pt-3 text-sm"><summary className="cursor-pointer font-medium">Office bonus split{game.completed ? " (earned, not paid)" : ""}</summary>
    <dl className="mt-2 space-y-2">{game.members.map(id => <div key={id} className="flex justify-between gap-3"><dt className="min-w-0 break-words">{players.find(p => p.id === id)?.full_name ?? "Former participant"} <span className="text-muted-foreground">({game.officeReward!.units[id] ?? 0} units)</span></dt><dd className="shrink-0 tabular-nums">{money(shares[id] ?? 0)}</dd></div>)}</dl>
  </details>;
}
