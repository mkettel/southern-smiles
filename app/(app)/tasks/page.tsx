import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getMyTasks } from "@/actions/tasks";
import { TaskListClient } from "@/components/tasks/task-list-client";

export default async function TasksPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const items = await getMyTasks();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">My Tasks</h1>
        <p className="text-muted-foreground text-sm">
          What's on your plate. Tap the circle to mark a task done.
        </p>
      </div>
      <TaskListClient initialItems={items} />
    </div>
  );
}
