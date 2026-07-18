import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getCanAccessSupplies, getSupplyWorkspace } from "@/actions/supplies";
import { SupplyOrderingWorkspace } from "@/components/supplies/supply-ordering-workspace";

export default async function SupplyOrderingPage() {
  const [profile, canAccessSupplies] = await Promise.all([
    getProfile(),
    getCanAccessSupplies(),
  ]);
  if (!profile) redirect("/login");
  if (!canAccessSupplies) redirect("/dashboard");

  const initialWorkspace = await getSupplyWorkspace();

  return (
    <div className="mx-auto max-w-7xl">
      <SupplyOrderingWorkspace
        canManageBudget={profile.role === "admin"}
        initialWorkspace={initialWorkspace}
        sharedPersistenceEnabled
      />
    </div>
  );
}
