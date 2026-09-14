import { z } from "zod";
import { actionDraftSchema } from "./action-log-suggestions";

export const sharedSuggestionSchema = z.object({
  id: z.string(),
  draft: actionDraftSchema,
  original_draft: actionDraftSchema,
  status: z.enum(["pending", "accepted", "dismissed"]),
  version: z.number().int().positive(),
  reviewed_at: z.string().nullable(),
  reviewed_by: z.string().nullable(),
  oic_entry_id: z.string().nullable(),
});
export type SharedActionSuggestion = z.infer<typeof sharedSuggestionSchema>;
