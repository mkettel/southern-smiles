import { redirect } from "next/navigation";
import { FileCheck2, FileWarning, Inbox } from "lucide-react";
import { getProfile } from "@/actions/auth";
import { getSupplyInvoiceInbox } from "@/actions/supply-invoices";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABELS: Record<string, string> = {
  needs_review: "Needs review",
  exact_match: "Exact match",
  possible_match: "Possible match",
  new_catalog_item: "New catalog item",
  duplicate: "Duplicate",
  reconciled: "Reconciled",
  rejected: "Rejected",
  parser_error: "Parser error",
};

function formatReceivedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function SupplyInvoiceInboxPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const inbox = await getSupplyInvoiceInbox();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supply Invoice Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Review vendor emails before any catalog or procedure-cost changes.
        </p>
      </div>

      {inbox.setupRequired ? (
        <div className="flex items-start gap-3 rounded-md border p-5 text-sm">
          <FileWarning className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <h2 className="font-medium">Invoice inbox schema is ready to apply</h2>
            <p className="mt-1 text-muted-foreground">
              Apply `supabase/migrations/045_add_supply_invoice_inbox.sql`
              before enabling Gmail forwarding.
            </p>
          </div>
        </div>
      ) : inbox.rows.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-md border border-dashed px-6 text-center">
          <Inbox className="h-7 w-7 text-muted-foreground" />
          <h2 className="mt-3 font-medium">No forwarded invoices yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Qualifying vendor messages will appear here after the Resend
            recipient and Gmail filter are enabled.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inbox.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatReceivedAt(row.received_at)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.vendor_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.from_address}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-lg">
                    <span className="line-clamp-2">{row.subject}</span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                      {row.attachment_count > 0
                        ? `${row.attachment_count} attachment${row.attachment_count === 1 ? "" : "s"}`
                        : "Email body"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
