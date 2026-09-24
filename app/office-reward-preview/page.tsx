import { notFound } from "next/navigation";
import { GamesWorkspace } from "@/components/games/games-workspace";
import { emptyGameData, type Game } from "@/lib/survival-game";

export default function OfficeRewardPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const players = ["Doctor", "Office member A", "Office member B", "Office member C", "Office member D", "Office member E", "Evelis"].map((full_name, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`, full_name,
  }));
  const game: Game = {
    id: "00000000-0000-4000-8000-000000000010",
    title: "150 implants", detail: "Reach 150 implants placed during 2026, together.",
    audience: "Office", kind: "Reach a goal", members: players.map(p => p.id),
    unit: "implants", current: 130, goal: 150, start: "2026-01-01", end: "2026-12-31",
    repeat: false, points: 0, verification: "Trusted updates",
    archived: false, completed: false, sides: ["Front office", "Back office"], scores: [0, 0],
    officeReward: { poolCents: 150000, units: Object.fromEntries(players.map((p,i) => [p.id, i === 0 ? 2 : i === 6 ? 0.5 : 1])) },
  };
  return <main className="mx-auto max-w-7xl p-4 sm:p-8"><GamesWorkspace preview initial={{
    practiceName: "Office reward preview",
    actor: { ...players[0], role: "admin", practice_id: game.id, is_active: true },
    players, version: 0, data: { ...emptyGameData, games: [game] },
  }} /></main>;
}
