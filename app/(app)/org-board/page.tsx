import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { OrgBoardView } from "@/components/org-board/org-board-view";
import { orgBoardData } from "@/lib/org-board-data";

export default async function OrgBoardPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Org Board</h1>
        <p className="text-muted-foreground">
          Southern Smiles organizational structure and responsibilities
        </p>
      </div>

      <OrgBoardView data={orgBoardData} />
    </div>
  );
}
