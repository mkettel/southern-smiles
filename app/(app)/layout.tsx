import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getOpenRequestCount, getNewRequestCount } from "@/actions/requests";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import type { Profile } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = (await getProfile()) as Profile | null;

  if (!profile) {
    redirect("/login");
  }

  const [openRequestCount, newRequestCount] = profile.role === "admin"
    ? await Promise.all([getOpenRequestCount(), getNewRequestCount()])
    : [0, 0];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        role={profile.role}
        openRequestCount={openRequestCount}
        newRequestCount={newRequestCount}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          profile={profile}
          openRequestCount={openRequestCount}
          newRequestCount={newRequestCount}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
