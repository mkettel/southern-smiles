import { GamesWorkspace } from "@/components/games/games-workspace";
import { loadSurvivalGame } from "@/actions/survival-game";

export default async function GamesPage() {
  return <GamesWorkspace initial={await loadSurvivalGame()} />;
}
