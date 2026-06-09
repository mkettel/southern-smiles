"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendBatch, setCampaignStatus } from "@/actions/surveys";
import type { CampaignStatus } from "@/lib/types";
import { Send, Lock } from "lucide-react";

export function CampaignActions({
  campaignId,
  status,
  recipientCount,
  unsentCount,
}: {
  campaignId: string;
  status: CampaignStatus;
  recipientCount: number;
  unsentCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <div className="flex flex-wrap items-center gap-2">
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

      {status !== "closed" ? (
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
      ) : (
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            run(
              "reopen",
              () => setCampaignStatus(campaignId, "active"),
              () => "Campaign reopened"
            )
          }
        >
          Reopen
        </Button>
      )}

      <span className="text-sm text-muted-foreground">
        {recipientCount} enrolled
      </span>
    </div>
  );
}
