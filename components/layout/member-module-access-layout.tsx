import { requireMemberModulePage } from "@/actions/member-module-access";
import type { ModuleKey } from "@/lib/workspace-access";

export async function MemberModuleAccessLayout({
  children,
  moduleKey,
}: {
  children: React.ReactNode;
  moduleKey: ModuleKey;
}) {
  await requireMemberModulePage(moduleKey);
  return children;
}
