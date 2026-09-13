"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyGameCommand, emptyGameData, type Data, type Player } from "@/lib/survival-game";

async function context() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) throw new Error("Please sign in.");
  const db = createAdminClient();
  const { data: actor, error } = await db.from("profiles").select("id, full_name, role, practice_id, is_active").eq("id", user.id).single();
  if (error || !actor?.is_active || !actor.practice_id) throw new Error("Active office membership required.");
  const { data: practice } = await db.from("practices").select("name,is_active").eq("id", actor.practice_id).single();
  if (!practice?.is_active) throw new Error("Office is inactive.");
  const { data: players, error: playersError } = await db.from("profiles").select("id,full_name").eq("practice_id", actor.practice_id).eq("is_active", true).order("full_name");
  if (playersError) throw new Error("Could not load participants.");
  return { db, actor, players: players as Player[], practiceName: practice.name };
}
function forPlayer(data: Data, actor: { id: string; role: string }) {
  if (actor.role === "admin") return data;
  const games = data.games.filter(g => g.audience !== "Individual" || g.members.includes(actor.id));
  const gameIds = new Set(games.map(g => g.id));
  return { ...data, games, requests: data.requests.filter(r => r.person === actor.id), balances: { [actor.id]: data.balances[actor.id] ?? 0 }, history: [], awards: {}, updates: data.updates.filter(u => gameIds.has(u.gameId)) };
}
export async function loadSurvivalGame() {
  const { db, actor, players, practiceName } = await context();
  const { data: row, error } = await db.from("survival_game_workspaces").select("state,version").eq("practice_id", actor.practice_id).maybeSingle();
  if (error) throw new Error("Could not load Survival Game.");
  return { data: forPlayer(row?.state ?? emptyGameData, actor), version: row?.version ?? 0, actor, players, practiceName };
}
export async function changeSurvivalGame(raw: unknown, version: number) {
  try {
    const { db, actor, players } = await context();
    if (!Number.isSafeInteger(version) || version < 0) throw new Error("Invalid version.");
    const { data: row, error } = await db.from("survival_game_workspaces").select("state,version").eq("practice_id", actor.practice_id).maybeSingle();
    if (error) throw new Error("Could not load games.");
    if ((row?.version ?? 0) !== version) throw new Error("Someone updated the games. Refresh and try again.");
    const state = applyGameCommand(row?.state ?? emptyGameData, raw, actor, players);
    // Compare-and-swap keeps totals, rewards, and history in one atomic write.
    const result = row
      ? await db.from("survival_game_workspaces").update({ state, version: version + 1, updated_at: new Date().toISOString() }).eq("practice_id", actor.practice_id).eq("version", version).select("version").maybeSingle()
      : await db.from("survival_game_workspaces").insert({ practice_id: actor.practice_id, state, version: 1 }).select("version").single();
    if (result.error || !result.data) throw new Error("Another update arrived. Refresh and try again.");
    return { success: true as const, data: forPlayer(state, actor), version: result.data.version };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Unable to save games." };
  }
}
