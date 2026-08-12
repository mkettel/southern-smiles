import { MemberModuleAccessLayout } from "@/components/layout/member-module-access-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <MemberModuleAccessLayout moduleKey="financial">{children}</MemberModuleAccessLayout>;
}
