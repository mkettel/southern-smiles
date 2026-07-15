import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { SupplyOrderingWorkspace } from "@/components/supplies/supply-ordering-workspace";

export default async function SupplyOrderingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl">
      <SupplyOrderingWorkspace />
    </div>
  );
}
