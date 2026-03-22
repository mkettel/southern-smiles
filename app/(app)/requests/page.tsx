import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getRequests } from "@/actions/requests";
import { RequestForm } from "@/components/requests/request-form";
import { RequestList } from "@/components/requests/request-list";

export default async function RequestsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const requests = await getRequests();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Bugs & Feature Requests</h1>
        <p className="text-muted-foreground">
          Track bugs, feature requests, and improvements
        </p>
      </div>

      <RequestForm />
      <RequestList requests={requests} />
    </div>
  );
}
