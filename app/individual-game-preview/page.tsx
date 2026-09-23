import { notFound } from "next/navigation";
import { GamesWorkspace } from "@/components/games/games-workspace";
import { emptyGameData, type Game } from "@/lib/survival-game";

export default function IndividualGamePreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const players = [
    { id: "00000000-0000-4000-8000-000000000001", full_name: "Monzer" },
    { id: "00000000-0000-4000-8000-000000000002", full_name: "Lisa" },
    { id: "00000000-0000-4000-8000-000000000003", full_name: "Team member" },
  ];
  const game: Game = {
    id: "00000000-0000-4000-8000-000000000010",
    title: "Whitening kits sold", detail: "Whoever sells the most whitening kits.",
    audience: "Individual", kind: "Compete", members: players.map(p => p.id),
    unit: "kits", current: 0, goal: 1, start: "2026-09-23", end: "2026-12-31",
    repeat: false, points: 200, verification: "Trusted updates",
    archived: false, completed: false, sides: ["Front office", "Back office"], scores: [0, 0],
    individualScores: { [players[0].id]: 1, [players[1].id]: 3 },
  };
  return <main className="mx-auto max-w-7xl p-4 sm:p-8"><GamesWorkspace preview initial={{
    practiceName: "Office competition preview",
    actor: { ...players[0], role: "admin", practice_id: game.id, is_active: true },
    players, version: 0, data: { ...emptyGameData, games: [game] },
  }} /></main>;
}
