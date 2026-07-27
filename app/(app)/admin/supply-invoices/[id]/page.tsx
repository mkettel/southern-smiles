import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProfile } from "@/actions/auth";
import { getSupplyInvoiceReview } from "@/actions/supply-invoices";
import { SupplyInvoiceReviewWorkspace } from "@/components/supply-invoices/supply-invoice-review-workspace";
import { Button } from "@/components/ui/button";

export default async function SupplyInvoiceReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  let data: Awaited<ReturnType<typeof getSupplyInvoiceReview>>;
  try {
    data = await getSupplyInvoiceReview(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-2"
            render={<Link href="/admin/supply-invoices" />}
          >
            <ArrowLeft />
            Invoice inbox
          </Button>
          <h1 className="text-2xl font-bold">Review supply invoice</h1>
          <p className="mt-1 max-w-3xl truncate text-sm text-muted-foreground">
            {data.invoice.vendor_name} · {data.invoice.subject}
          </p>
        </div>
      </div>
      <SupplyInvoiceReviewWorkspace
        invoice={data.invoice}
        catalog={data.workspace.catalog}
      />
    </div>
  );
}
