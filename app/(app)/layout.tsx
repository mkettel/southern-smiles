import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getOpenRequestCount, getNewRequestCount } from "@/actions/requests";
import { getPracticeSettings } from "@/actions/settings";
import { getConversations, getUnreadMessageCount, getPracticeMembers } from "@/actions/messages";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ChatWidget } from "@/components/messages/chat-widget";
import { ThemeColorInjector } from "@/components/theme-color-injector";
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

  const [requestCounts, settings, conversations, unreadMessageCount, practiceMembers] =
    await Promise.all([
      profile.role === "admin"
        ? Promise.all([getOpenRequestCount(), getNewRequestCount()])
        : Promise.resolve([0, 0]),
      getPracticeSettings(),
      getConversations(),
      getUnreadMessageCount(),
      getPracticeMembers(),
    ]);

  const [openRequestCount, newRequestCount] = requestCounts;
  const practiceName = settings.short_name ?? settings.name;
  const logoUrl = settings.logo_url;

  return (
    <div className="flex h-screen overflow-hidden">
      <ThemeColorInjector primaryColor={settings.primary_color} />
      <Sidebar
        role={profile.role}
        openRequestCount={openRequestCount}
        newRequestCount={newRequestCount}
        practiceName={practiceName}
        logoUrl={logoUrl}
        showNameWithLogo={settings.show_name_with_logo}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          profile={profile}
          openRequestCount={openRequestCount}
          newRequestCount={newRequestCount}
          practiceName={practiceName}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <ChatWidget
        profile={profile}
        initialConversations={conversations}
        practiceMembers={practiceMembers}
        unreadMessageCount={unreadMessageCount}
      />
    </div>
  );
}
