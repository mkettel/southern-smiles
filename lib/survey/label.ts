// A stable, non-identifying display label for a de-identified patient.
// Prefers the practice's own chart id (external_ref); otherwise a short slice
// of the opaque bridge_key. Names are never stored, so this is all the admin
// UI can show — the practice cross-references their own retained CSV for names.
export function patientLabel(p: {
  external_ref?: string | null;
  bridge_key?: string | null;
}): string {
  const ref = p.external_ref?.trim();
  if (ref) return ref;
  const key = p.bridge_key?.trim();
  if (key) return `Patient ${key.slice(0, 6)}`;
  return "A patient";
}
