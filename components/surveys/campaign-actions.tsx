"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { deleteCampaign, sendBatch, setCampaignStatus } from "@/actions/surveys";
import type { CampaignStatus } from "@/lib/types";
import { Globe, Lock, Send, Trash2, Undo2 } from "lucide-react";

const STATUS_HINTS: Record<CampaignStatus, string> = {
  draft: "Draft — survey links aren't live yet. Publish (or mark letters sent) to activate them.",
  active: "Active — survey links and QR codes are live.",
  closed: "Closed — visitors see a “survey closed” message.",
};

export function CampaignActions({
  campaignId,
  campaignTitle,
  status,
  recipientCount,
  unsentCount,
  children,
}: {
  campaignId: string;
  campaignTitle: string;
  status: CampaignStatus;
  recipientCount: number;
  unsentCount: number;
  /** Leading toolbar items (enrollment manager, test person, …). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function run(key: string, fn: () => Promise<{ error?: unknown } & Record<string, unknown>>, ok: (r: Record<string, unknown>) => string) {
    setBusy(key);
    const result = await fn();
    setBusy(null);
    if (result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Something went wrong");
      return;
    }
    toast.success(ok(result));
    router.refresh();
  }

  async function handleDelete() {
    setBusy("delete");
    const result = await deleteCampaign(campaignId);
    setBusy(null);
    if (result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Could not delete");
      return;
    }
    toast.success("Campaign deleted");
    router.push("/admin/surveys");
  }

  return (
    <div className="space-y-1.5">
      <div className="flex w-full flex-wrap items-center gap-2">
        {children}
        <Button
          disabled={busy !== null || unsentCount === 0}
          onClick={() =>
            run(
              "send",
              () => sendBatch(campaignId),
              (r) => `Marked ${r.sent} letters sent & logged to Personalized Outflow`
            )
          }
        >
          <Send className="mr-1.5 h-4 w-4" />
          {busy === "send"
            ? "Sending…"
            : unsentCount > 0
              ? `Mark ${unsentCount} sent`
              : "All sent"}
        </Button>

        {status === "draft" && (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              run(
                "publish",
                () => setCampaignStatus(campaignId, "active"),
                () => "Published — survey links are now live"
              )
            }
          >
            <Globe className="mr-1.5 h-4 w-4" />
            Publish links
          </Button>
        )}

        {status === "active" && (
          <>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                run(
                  "draft",
                  () => setCampaignStatus(campaignId, "draft"),
                  () => "Back to draft — survey links paused"
                )
              }
            >
              <Undo2 className="mr-1.5 h-4 w-4" />
              Back to draft
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                run(
                  "close",
                  () => setCampaignStatus(campaignId, "closed"),
                  () => "Campaign closed"
                )
              }
            >
              <Lock className="mr-1.5 h-4 w-4" />
              Close
            </Button>
          </>
        )}

        {status === "closed" && (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              run(
                "reopen",
                () => setCampaignStatus(campaignId, "active"),
                () => "Campaign reopened — links are live again"
              )
            }
          >
            <Globe className="mr-1.5 h-4 w-4" />
            Reopen
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {recipientCount} enrolled
          </span>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger
              onClick={() => setDeleteOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DialogTrigger>
          <DialogPortal>
            <DialogOverlay />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete “{campaignTitle}”?</DialogTitle>
                <DialogDescription>
                  This permanently deletes the campaign, its{" "}
                  {recipientCount} enrolled recipient
                  {recipientCount === 1 ? "" : "s"}, all survey responses, and
                  any promised credits. Mailed QR codes will stop working.
                  There is no undo.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose className="inline-flex items-center rounded-lg border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted">
                  Cancel
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={busy !== null}
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {busy === "delete" ? "Deleting…" : "Delete campaign"}
                </Button>
              </DialogFooter>
            </DialogContent>
            </DialogPortal>
          </Dialog>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{STATUS_HINTS[status]}</p>
    </div>
  );
}
