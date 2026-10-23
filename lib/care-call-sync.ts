export const CARE_CALL_START = "2026-10-26";
export const CARE_CALL_STAT = "3b8ff011-e57d-4be7-89d2-d98b9070da0f";
export const CARE_CALL_PRACTICE = "4410400a-84eb-4984-a7f9-68661bdb5213";
export const CARE_CALL_ACTOR = "d6c19e94-7cce-41c7-be32-e21eaeedc0a7";
export function isCareCallSync(statId: string, date: string) {
  return statId === CARE_CALL_STAT && date >= CARE_CALL_START;
}
export function phoenixDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function validateCareSnapshot(body: unknown, now = new Date()) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Invalid snapshot");
  const v = body as Record<string, unknown>;
  if (
    Object.keys(v).sort().join(",") !==
      "count,date,metric,revision,startDate" ||
    v.metric !== "care-call-attempts-v1" ||
    v.startDate !== CARE_CALL_START
  )
    throw new Error("Invalid metric");
  if (
    typeof v.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.date) ||
    !Number.isFinite(Date.parse(v.date)) ||
    new Date(v.date).toISOString().slice(0, 10) !== v.date ||
    v.date < CARE_CALL_START ||
    v.date >= phoenixDay(now)
  )
    throw new Error("Only completed days from October 26 are accepted");
  if (
    typeof v.count !== "number" ||
    !Number.isSafeInteger(v.count) ||
    v.count < 0 ||
    v.count > 1000000
  )
    throw new Error("Invalid count");
  if (
    typeof v.revision !== "number" ||
    !Number.isSafeInteger(v.revision) ||
    v.revision <= 0 ||
    v.revision > now.getTime() + 300000
  )
    throw new Error("Invalid revision");
  return { date: v.date, count: v.count, revision: v.revision };
}
export interface CareSyncDay {
  entry_date: string;
  vault_count: number | null;
  additional_count: number;
  source_revision: number | null;
  synced_at: string | null;
}
