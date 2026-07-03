"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarCheck2, Trash2, Upload } from "lucide-react";
import {
  deleteCherryApproval,
  importCherryApprovalEmail,
  type CherryFinancingDashboardData,
} from "@/actions/cherry-financing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

function toDatetimeLocal(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSourceMessageId(value: string) {
  if (value.startsWith("manual:")) return "Manual paste";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function CherryFinancingDashboard({
  initialData,
}: {
  initialData: CherryFinancingDashboardData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [messageId, setMessageId] = useState("");
  const [receivedAt, setReceivedAt] = useState(toDatetimeLocal(new Date()));

  function submit() {
    if (!subject.trim()) {
      toast.error("Paste the Cherry email subject");
      return;
    }
    if (!body.trim()) {
      toast.error("Paste the Cherry email body");
      return;
    }

    const receivedDate = new Date(receivedAt);
    if (Number.isNaN(receivedDate.getTime())) {
      toast.error("Pick a valid received date");
      return;
    }

    startTransition(async () => {
      const result = await importCherryApprovalEmail({
        messageId: messageId.trim() || null,
        subject,
        body,
        receivedAt: receivedDate.toISOString(),
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Cherry approval imported");
      setSubject("");
      setBody("");
      setMessageId("");
      setReceivedAt(toDatetimeLocal(new Date()));
      router.refresh();
    });
  }

  function removeApproval(id: string) {
    startTransition(async () => {
      const result = await deleteCherryApproval(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Approval removed");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Approved this week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCents(initialData.currentWeekTotalCents)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Week of {initialData.currentWeekStart}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarCheck2 className="h-4 w-4" />
              Stat sync
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Approved Financing is calculated from imported Cherry approvals
              and synced into the Division 2 stat for the matching week.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import Cherry approval</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              <Label htmlFor="cherry-subject">Subject</Label>
              <Input
                id="cherry-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Patient has been approved for $10,000 at Southern Smiles"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cherry-received">Received</Label>
              <Input
                id="cherry-received"
                type="datetime-local"
                value={receivedAt}
                onChange={(event) => setReceivedAt(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cherry-message-id">Message id</Label>
            <Input
              id="cherry-message-id"
              value={messageId}
              onChange={(event) => setMessageId(event.target.value)}
              placeholder="Optional for manual paste; Gmail/webhook should send the real message id"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cherry-body">Email body</Label>
            <Textarea
              id="cherry-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={"Paste the Cherry email body here. The parser looks for Total Available and the dollar amount below it."}
              className="min-h-48"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={submit} disabled={isPending}>
              <Upload className="h-4 w-4" />
              Import approval
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent imports</CardTitle>
        </CardHeader>
        <CardContent>
          {initialData.approvals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Cherry approvals imported yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialData.approvals.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(approval.approved_at)}
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {formatSourceMessageId(approval.source_message_id)}
                    </TableCell>
                    <TableCell>{approval.week_start}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCents(approval.amount_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeApproval(approval.id)}
                        disabled={isPending}
                        aria-label="Delete approval"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
