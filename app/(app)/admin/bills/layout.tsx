import { ModuleAccessLayout } from "@/components/layout/module-access-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleAccessLayout moduleKey="bills">{children}</ModuleAccessLayout>;
}
