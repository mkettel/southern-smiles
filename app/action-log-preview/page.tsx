import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { ActionLogPreview } from "@/components/oic/action-log-preview";

export default function ActionLogPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar role="admin" practiceName="Southern Smiles" />
      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
        <ActionLogPreview />
      </main>
    </div>
  );
}
