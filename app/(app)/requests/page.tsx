import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getRequests, getLastSeenAt } from "@/actions/requests";
import { RequestForm } from "@/components/requests/request-form";
import { RequestList } from "@/components/requests/request-list";
import { MarkSeenOnMount } from "@/components/requests/mark-seen-on-mount";

export default async function RequestsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const [requests, lastSeenAt] = await Promise.all([
    getRequests(),
    getLastSeenAt(),
  ]);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <MarkSeenOnMount />
      <div>
        <h1 className="text-2xl font-bold">Bugs & Feature Requests</h1>
        <p className="text-muted-foreground">
          Track bugs, feature requests, and improvements
        </p>
      </div>

      <RequestForm />
      <RequestList requests={requests} lastSeenAt={lastSeenAt} />
    </div>
  );
}
