"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { generateRecipients } from "@/actions/surveys";
import type { SurveyCampaign } from "@/lib/types";

export function EnrollDialog({
  open,
  onOpenChange,
  campaigns,
  selectedIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaigns: SurveyCampaign[];
  selectedIds: string[];
}) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState("");
  const [loading, setLoading] = useState(false);

  const openable = campaigns.filter((c) => c.status !== "closed");

  async function handleEnroll() {
    if (!campaignId) {
      toast.error("Pick a campaign");
      return;
    }
    setLoading(true);
    const res = await generateRecipients(campaignId, selectedIds);
    setLoading(false);
    if (res.error) {
      toast.error(typeof res.error === "string" ? res.error : "Enroll failed");
      return;
    }
    toast.success(
      `Enrolled ${res.created} patient${res.created === 1 ? "" : "s"}` +
        (res.created !== selectedIds.length
          ? ` (${selectedIds.length - (res.created ?? 0)} already in this campaign)`
          : "")
    );
    onOpenChange(false);
    router.push(`/admin/surveys/${campaignId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Enroll {selectedIds.length} patient
              {selectedIds.length === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              Mint a unique survey code for each selected patient in the chosen
              campaign. Patients already enrolled are skipped.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {openable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No open campaigns. Create one first, then enroll.
              </p>
            ) : (
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a campaign…</option>
                {openable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          <DialogFooter>
            <DialogClose className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
              Cancel
            </DialogClose>
            <Button
              onClick={handleEnroll}
              disabled={loading || openable.length === 0 || !campaignId}
            >
              {loading ? "Enrolling…" : "Enroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
