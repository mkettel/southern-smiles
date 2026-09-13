import { z } from "zod";

const number = z.number().finite().nonnegative().max(1e9);
const date = z.string().refine(v => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "Invalid date");
export const gameSchema = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1).max(100), detail: z.string().trim().min(1).max(400),
  audience: z.enum(["Individual", "Team", "Office"]), members: z.array(z.string().uuid()).min(1).max(500),
  kind: z.enum(["Reach a goal", "Stay within a limit", "Build consistency", "Compete"]),
  unit: z.string().trim().min(1).max(80), current: number, goal: number.positive(),
  start: date, end: date, repeat: z.boolean(), points: number.int(),
  verification: z.enum(["Trusted updates", "Manager approval", "Manager entry"]),
  archived: z.boolean(), completed: z.boolean(), sides: z.array(z.string().trim().min(1).max(80)).length(2), scores: z.array(number).length(2),
}).refine(g => !g.end || g.end >= g.start, "End date must follow start date");
export type Game = z.infer<typeof gameSchema>;
export type Reward = { id: string; title: string; points: number };
export type Request = { id: string; gameId?: string; title: string; person: string; value: number; before?: number; note: string; type: "progress" | "reward"; status: "pending" | "approved" | "declined" };
export type ProgressEvent = { gameId: string; title: string; person: string; before: number; after: number; note: string; at: string };
export type Data = { games: Game[]; requests: Request[]; rewards: Reward[]; balances: Record<string, number>; history: string[]; updates: ProgressEvent[]; awards: Record<string, Record<string, number>> };
export type Player = { id: string; full_name: string };
export const emptyGameData: Data = { games: [], requests: [], rewards: [], balances: {}, history: [], updates: [], awards: {} };
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("saveGame"), game: gameSchema }),
  z.object({ type: z.literal("archive"), id: z.string().uuid(), archived: z.boolean() }),
  z.object({ type: z.literal("progress"), id: z.string().uuid(), before: number, value: number, note: z.string().max(500) }),
  z.object({ type: z.literal("decide"), id: z.string().uuid(), approve: z.boolean() }),
  z.object({ type: z.literal("finish"), id: z.string().uuid() }),
  z.object({ type: z.literal("saveReward"), reward: z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(100), points: number.int().positive() }) }),
  z.object({ type: z.literal("reward"), id: z.string().uuid() }),
]);
export type Command = z.infer<typeof commandSchema>;
export function eligible(g: Game, now = new Date()) {
  return g.kind === "Stay within a limit" ? !!g.end && new Date(`${g.end}T23:59:59-07:00`) < now && g.current <= g.goal : g.kind !== "Compete" && g.current >= g.goal;
}
export function applyGameCommand(original: Data, raw: unknown, actor: { id: string; full_name: string; role: string }, players: Player[], now = new Date(), uuid = () => crypto.randomUUID()): Data {
  const command = commandSchema.parse(raw);
  const data: Data = structuredClone({ ...emptyGameData, ...original });
  const admin = actor.role === "admin";
  const requireAdmin = () => { if (!admin) throw new Error("Only an administrator can manage games."); };
  const log = (message: string) => data.history.unshift(`${now.toISOString()} - ${actor.full_name}: ${message}`);
  const find = (id: string) => { const g = data.games.find(g => g.id === id); if (!g) throw new Error("Game not found."); return g; };
  const complete = (g: Game, yes: boolean) => {
    if (g.completed === yes) return;
    if (yes) {
      const award = Object.fromEntries(g.members.map(id => [id, g.points]));
      for (const [id, points] of Object.entries(award)) data.balances[id] = (data.balances[id] ?? 0) + points;
      data.awards[g.id] = award;
    } else {
      for (const [id, points] of Object.entries(data.awards[g.id] ?? {})) data.balances[id] = (data.balances[id] ?? 0) - points;
      delete data.awards[g.id];
    }
    g.completed = yes;
    log(`${g.title}: ${yes ? "goal completed; points awarded" : "goal reopened; award reversed"}`);
  };
  const progress = (g: Game, value: number, person: string, note: string) => {
    const before = g.current;
    g.current = value;
    data.updates.unshift({ gameId: g.id, title: g.title, person, before, after: value, note, at: now.toISOString() });
    log(`${g.title}: ${before} to ${value}${note ? ` (${note})` : ""}`);
    if (g.kind !== "Compete") complete(g, eligible(g, now));
  };
  switch (command.type) {
    case "saveGame": {
      requireAdmin();
      const g = command.game;
      const ids = new Set(players.map(p => p.id));
      if (g.members.some(id => !ids.has(id))) throw new Error("Participants must be active members of this office.");
      if (g.audience === "Individual" && g.members.length !== 1) throw new Error("Choose one participant for an individual game.");
      const old = data.games.find(item => item.id === g.id);
      if (old?.completed && (old.points !== g.points || JSON.stringify(old.members) !== JSON.stringify(g.members))) throw new Error("Reopen the goal before changing awarded points or participants.");
      g.completed = old?.completed ?? false;
      g.members = [...new Set(g.members)];
      data.games = old ? data.games.map(item => item.id === g.id ? g : item) : [...data.games, g];
      if (old && old.current !== g.current) {
        const value = g.current; g.current = old.current;
        progress(g, value, actor.id, "Manager correction");
      }
      log(`Saved ${g.title}`); break;
    }
    case "archive": requireAdmin(); find(command.id).archived = command.archived; log(`${command.archived ? "Archived" : "Restored"} ${find(command.id).title}`); break;
    case "progress": {
      const g = find(command.id);
      if (g.archived || (!admin && !g.members.includes(actor.id))) throw new Error("You cannot update this game.");
      if (g.kind === "Compete" || g.verification === "Manager entry") requireAdmin();
      if (g.current !== command.before) throw new Error("The count changed. Refresh and enter your update again.");
      if (g.verification === "Manager approval" && !admin) {
        if (data.requests.some(r => r.gameId === g.id && r.person === actor.id && r.status === "pending")) throw new Error("An update is already waiting for approval.");
        data.requests.push({ id: uuid(), gameId: g.id, title: g.title, person: actor.id, value: command.value, before: g.current, note: command.note, type: "progress", status: "pending" });
      } else progress(g, command.value, actor.id, command.note);
      break;
    }
    case "decide": {
      requireAdmin();
      const r = data.requests.find(r => r.id === command.id);
      if (!r || r.status !== "pending") throw new Error("Request already handled.");
      if (command.approve && r.type === "progress") {
        const g = find(r.gameId!);
        if (g.archived || g.current !== r.before) throw new Error("The game changed since submission. Decline this request and enter the correct total.");
        progress(g, r.value, r.person, r.note);
      }
      if (!command.approve && r.type === "reward") data.balances[r.person] = (data.balances[r.person] ?? 0) + r.value;
      r.status = command.approve ? "approved" : "declined";
      log(`${r.status}: ${r.title}`); break;
    }
    case "finish": { requireAdmin(); const g = find(command.id); if (g.archived || !eligible(g, now)) throw new Error("The goal has not been met."); complete(g, true); break; }
    case "saveReward": requireAdmin(); data.rewards = data.rewards.some(r => r.id === command.reward.id) ? data.rewards.map(r => r.id === command.reward.id ? command.reward : r) : [...data.rewards,command.reward]; log(`Saved reward ${command.reward.title}`); break;
    case "reward": {
      const reward = data.rewards.find(r => r.id === command.id);
      if (!reward || (data.balances[actor.id] ?? 0) < reward.points) throw new Error("Not enough points for this reward.");
      data.balances[actor.id] -= reward.points;
      data.requests.push({ id: uuid(), person: actor.id, title: reward.title, value: reward.points, type: "reward", status: "pending", note: "Points reserved; refunded if declined." });
      log(`Requested ${reward.title}`); break;
    }
  }
  return data;
}
