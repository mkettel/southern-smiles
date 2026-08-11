import { requireWorkspaceModulePage } from "@/actions/workspace-access";
import type { ModuleKey } from "@/lib/workspace-access";

export async function ModuleAccessLayout({
  moduleKey,
  children,
}: {
  moduleKey: ModuleKey;
  children: React.ReactNode;
}) {
  await requireWorkspaceModulePage(moduleKey);
  return children;
}

