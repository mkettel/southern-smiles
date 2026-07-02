interface CollectionsEntry {
  value: number | string | null | undefined;
}

interface StaffDayEntry {
  input_value: number | string | null | undefined;
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

