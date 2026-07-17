interface CollectionsEntry {
  entry_date?: string | null | undefined;
  value: number | string | null | undefined;
}

interface StaffDayEntry {
  entry_date?: string | null | undefined;
  input_value: number | string | null | undefined;
}

interface RatioEntry {
  value: number | string | null | undefined;
}

function toFiniteNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function calculateCollectionsPerStaffWeek(
  collectionsEntries: CollectionsEntry[],
  staffEntries: StaffDayEntry[],
) {
  const collectionsByDate = new Map<string, number>();
  for (const entry of collectionsEntries) {
    const value = toFiniteNumber(entry.value);
    if (value === null || !entry.entry_date) continue;
    collectionsByDate.set(entry.entry_date, value);
  }

  const staffByDate = new Map<string, number>();
  for (const entry of staffEntries) {
    const value = toFiniteNumber(entry.input_value);
    if (value === null || !entry.entry_date) continue;
    staffByDate.set(entry.entry_date, value);
  }

  const hasDateAnchors = collectionsByDate.size > 0 || staffByDate.size > 0;
  if (hasDateAnchors) {
    for (const collectionDate of collectionsByDate.keys()) {
      if (!staffByDate.has(collectionDate)) return null;
    }

    const totalStaffDays = [...staffByDate.values()].reduce((sum, value) => sum + value, 0);
    if (totalStaffDays <= 0) return null;

    const totalCollections = [...staffByDate.keys()].reduce(
      (sum, date) => sum + (collectionsByDate.get(date) ?? 0),
      0,
    );
    return totalCollections / totalStaffDays;
  }

  const totalCollections = collectionsEntries.reduce((sum, entry) => {
    const value = toFiniteNumber(entry.value);
    return value === null ? sum : sum + value;
  }, 0);

  const totalStaffDays = staffEntries.reduce((sum, entry) => {
    const value = toFiniteNumber(entry.input_value);
    return value === null ? sum : sum + value;
  }, 0);

  if (totalStaffDays <= 0) return null;

  return totalCollections / totalStaffDays;
}

export function calculateRatioOfSumsWeek(
  numeratorEntries: RatioEntry[],
  denominatorEntries: RatioEntry[],
) {
  const denominatorValues = denominatorEntries
    .map((entry) => toFiniteNumber(entry.value))
    .filter((value): value is number => value !== null);
  if (!denominatorValues.length) return null;

  const denominator = denominatorValues.reduce((sum, value) => sum + value, 0);
  if (denominator <= 0) return null;

  const numerator = numeratorEntries.reduce((sum, entry) => {
    const value = toFiniteNumber(entry.value);
    return value === null ? sum : sum + value;
  }, 0);

  return (numerator / denominator) * 100;
}
