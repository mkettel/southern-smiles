import { ModuleAccessLayout } from "@/components/layout/module-access-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleAccessLayout moduleKey="oic_log">{children}</ModuleAccessLayout>;
}
