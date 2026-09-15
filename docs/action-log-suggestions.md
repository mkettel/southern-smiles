# Action Log suggestions

## Shared inbox

The admin Action Log at `/oic-log` now reads a shared, practice-scoped suggestion inbox. Existing entries retain their list/calendar views and existing edit/delete controls. Staff do not receive the admin suggestion inbox.

The new tables are service-only with RLS enabled and browser grants revoked. The RPC is SECURITY INVOKER and executable only by the service role. Server actions authenticate the current user and derive the practice from their active admin profile; the RPC repeats the actor/practice/role checks. Original source evidence and operation history are retained. A practice-level advisory lock, version checks, duplicate detection, and a single database transaction protect approval. Retrying approval cannot insert twice, and a failed bulk approval rolls back the whole batch.

Accepted suggestions cannot be restored; corrections are made through the existing Action Log controls. Deleting an accepted log entry does not resurrect its suggestion. The preview's undo behavior is deliberately not used against shared entries that others may already have edited.

## Project-work intake

`docs/action-log-project-updates.json` contains two source-backed website drafts: site-wide Google Ads call tracking and smile-gallery internal linking. Dates and implementation remain unconfirmed until reviewed. The call-tracking entry explicitly distinguishes a measurement change from an increase in actual leads.

Admins can import the file in the shared inbox. For agent-assisted completion capture, use the import-only CLI from the Board worktree:

```sh
node --import tsx scripts/import-action-suggestions.ts --file docs/action-log-project-updates.json
node --import tsx scripts/import-action-suggestions.ts --file <drafts.json> --practice <practice-uuid> --actor <active-admin-uuid> --apply
```

The first command is a dry run. The second uses the existing server environment, never prints credentials, and can only import pending suggestions. Keep these credentials in the Board server environment; do not copy them to the website or a browser. Use stable source keys so repeating a completion import skips entries already accepted or dismissed. Imports are all-or-nothing on malformed data.

This is a working assisted-import connection, not unattended Google Ads polling. No Google Ads API connector or recurring scheduler is configured. Future completed-work tasks should prepare a non-sensitive draft bundle and run the import command with the authorized practice/admin context. Do not ingest conversation transcripts, plans, patient information, or credentials. A deployment check is stronger evidence than a merge; uncertainty stays visible for review.

The additive migration and the two pending project drafts were applied September 13, 2026 (Phoenix). The existing 76 OIC entries were unchanged. The UI requires the associated PR to be merged/deployed. Tests use isolated PostgreSQL through PGlite, never production rows. Supabase's no-RLS-policy advisory is expected for these service-only tables; browser table access and RPC execution are explicitly denied and tested.

## Local-only preview

Open `/action-log-preview` with the development server. It is unavailable in production, does not read private practice entries, and never calls a production write action. An admin-only development link also appears on `/oic-log`.

## Included

- Review, edit, dismiss, restore, select ready entries, bulk add, and undo add.
- Quick office notes; searchable local timeline; effective-date and implementation confirmation.
- Two source-backed draft candidates from merged Board PRs. Merge dates are NOT treated as verified implementation dates.
- Browser-local persistence, storage-failure reporting, and a stale-tab check before writes.
- JSON suggestion import/export and accepted-entry export using the existing `createOicEntry` input shape. Imports are validated, deduplicated by source key or same-date normalized description, and always require confirmation. Imported text is data, never executable instructions.
- Suggestions carry stat labels only. These are hypotheses to watch, not established causal effects or bound stat IDs.

## Import contract

Export suggestions to obtain a valid JSON array. Each draft contains `id`, `source_key`, `source_label`, `source_url`, `title`, `entry_text`, `effective_date`, `date_confirmed`, `implementation`, `area`, `post_affected`, `stats`, and `evidence`. Use a stable source key per real-world change, not per processing run. HTTP(S) URLs only, no credentials. Max 200 items / 1 MB per import. No sensitive patient information in notes or source links.

Reimporting dismissed or accepted candidates does not recreate them. Exported suggestions return as pending/unconfirmed when imported into an empty preview. The timeline export is separate and is not a backup of review states. Local storage is a prototype, not a shared or durable system of record; simultaneous cross-tab writes are not transactional.

## Further integration

1. Bind suggested stat labels to the practice's actual stat IDs, with optional chart annotations.
2. Add Google Ads API change history or a scheduled completed-task review after credentials/schedule are selected. Group related edits into meaningful practice actions.
3. Flag semantic near-duplicates for review; current duplicate checks use source keys and normalized same-date descriptions. Do not silently discard distinct actions.
4. Add paginated inbox history beyond the current 500 most recently updated suggestions.

The local-only preview remains isolated. The shared `/oic-log` inbox writes real suggestions and posts real entries only when an administrator approves them.
