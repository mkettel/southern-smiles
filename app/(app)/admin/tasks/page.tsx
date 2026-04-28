import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getAllTasks } from "@/actions/tasks";
import { getPracticeMembers } from "@/actions/messages";
import { AdminTaskCenter } from "@/components/tasks/admin-task-center";

export default async function AdminTasksPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/tasks");

  const [tasks, members] = await Promise.all([getAllTasks(), getPracticeMembers()]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Command Center</h1>
        <p className="text-muted-foreground text-sm">
          Assign work, review submissions, and see what's outstanding.
        </p>
      </div>
      <AdminTaskCenter
        initialTasks={tasks}
        members={members.filter((m) => m.is_active)}
      />
    </div>
  );
}
