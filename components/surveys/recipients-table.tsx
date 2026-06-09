"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/lib/survey/csv";
import { markCreditRedeemed } from "@/actions/surveys";
import type { SurveyRecipient, CreditStatus } from "@/lib/types";
import { Download, Printer, Check } from "lucide-react";

const CREDIT_BADGE: Record<CreditStatus, { label: string; className: string }> = {
  none: { label: "Not sent", className: "bg-muted text-muted-foreground" },
  promised: {
    label: "Promised",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  redeemed: {
    label: "Redeemed",
    className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  },
  expired: {
    label: "Expired",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  },
};

export function RecipientsTable({
  campaignId,
  recipients,
}: {
  campaignId: string;
  recipients: SurveyRecipient[];
}) {
  const router = useRouter();
  const [redeeming, setRedeeming] = useState<string | null>(null);

  function downloadMergeCsv() {
    const origin = window.location.origin;
    const rows = recipients.map((r) => ({
      full_name: r.patient?.full_name ?? "",
      first_name: r.patient?.first_name ?? "",
      survey_url: `${origin}/survey/${r.code}`,
      code: r.code,
    }));
    const csv = toCsv(["full_name", "first_name", "survey_url", "code"], rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `survey-merge-${campaignId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function redeem(id: string) {
    setRedeeming(id);
    const result = await markCreditRedeemed(id);
    setRedeeming(null);
    if (result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Failed");
      return;
    }
    toast.success("Credit marked redeemed");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={downloadMergeCsv} disabled={recipients.length === 0}>
          <Download className="mr-1.5 h-4 w-4" />
          Merge CSV
        </Button>
        <a
          href={`/print/survey/${campaignId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Printer className="h-4 w-4" />
          Print QR sheet
        </a>
      </div>

      {recipients.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No recipients yet. Use “Enroll all patients” to mint survey codes.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Responded</TableHead>
                <TableHead>Credit</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((r) => {
                const badge = CREDIT_BADGE[r.credit_status];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.patient?.full_name ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.code}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.sent_at ? new Date(r.sent_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      {r.responded_at ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.credit_status === "promised" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={redeeming === r.id}
                          onClick={() => redeem(r.id)}
                        >
                          {redeeming === r.id ? "…" : "Mark redeemed"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
