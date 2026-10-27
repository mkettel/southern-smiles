import { CARE_CALL_ACTOR, CARE_CALL_PRACTICE, CARE_CALL_STAT } from "./care-call-sync";

type Snapshot = { date: string; count: number; revision: number };

export async function importCareCallSnapshot(
  snapshot: Snapshot,
  save: (snapshot: Snapshot) => Promise<void>,
  refresh: (stat: string, week: string, actor: string, practice: string) => Promise<void>,
) {
  await save(snapshot);
  const week = new Date(`${snapshot.date}T00:00:00Z`);
  week.setUTCDate(week.getUTCDate() - (week.getUTCDay() + 6) % 7);
  // Refresh even after a duplicate snapshot: a prior attempt may have saved
  // Care Calls successfully but failed while updating its dependent totals.
  await refresh(CARE_CALL_STAT, week.toISOString().slice(0, 10), CARE_CALL_ACTOR, CARE_CALL_PRACTICE);
}
