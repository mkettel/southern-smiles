import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { SupplyOrderingWorkspace } from "@/components/supplies/supply-ordering-workspace";

export default function SupplyOrderingPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role="admin" practiceName="Southern Smiles" />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
          <p className="text-sm text-muted-foreground">Southern Smiles</p>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
              Local draft
            </span>
            <span className="hidden text-muted-foreground sm:inline">
              Dr. Monzer Shakally
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              MS
            </span>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <SupplyOrderingWorkspace />
        </main>
      </div>
    </div>
  );
}
