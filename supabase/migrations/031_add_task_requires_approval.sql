-- ============================================================
-- Migration 031: Optional admin approval per task
-- ============================================================
-- Adds a per-task `requires_approval` flag (default false).
--
-- When false (the default): assignee marking a task "done" jumps
-- straight to status='approved'. No admin review step.
--
-- When true: existing flow — assignee marks 'submitted', admin
-- approves to move it to 'approved'.
--
-- The assignee UPDATE policy is broadened so assignees can set
-- status='approved' on themselves IFF the parent task is
-- auto-approve (requires_approval = false). For approval-required
-- tasks the original guardrail still holds: only admins can
-- transition to 'approved'.
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;

-- Helper used in the assignee UPDATE policy. SECURITY DEFINER so
-- it bypasses RLS on tasks (avoids a permission check on a row
-- the assignee can already read anyway).
CREATE OR REPLACE FUNCTION task_auto_approves(t_id uuid)
RETURNS boolean AS $$
  SELECT NOT requires_approval FROM tasks WHERE id = t_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Replace the assignee UPDATE policy with one that also lets them
-- self-finalize an auto-approve task.
DROP POLICY IF EXISTS "Assignees update own assignment" ON task_assignments;

CREATE POLICY "Assignees update own assignment"
  ON task_assignments FOR UPDATE
  USING (
    practice_id = get_practice_id()
    AND profile_id = auth.uid()
  )
  WITH CHECK (
    practice_id = get_practice_id()
    AND profile_id = auth.uid()
    AND (
      status IN ('assigned', 'in_progress', 'submitted')
      OR (status = 'approved' AND task_auto_approves(task_id))
    )
  );
