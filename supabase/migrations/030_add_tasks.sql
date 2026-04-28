-- ============================================================
-- Migration 030: Command Center — assignable tasks
-- ============================================================
-- Admin (or anyone, for now) creates a task and assigns it to
-- one (or more) practice members. Each assignee tracks their
-- own status independently via task_assignments.
--
-- Schema is multi-assignee from day one even though the UI
-- starts single-assignee — adding multi later is just a UI
-- change, no migration. Recurrence is intentionally out of
-- scope; can be layered on with a `recurrence_rule` column +
-- `parent_task_id` later.
-- ============================================================

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR char_length(description) <= 4000),
  due_date date,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_practice_created
  ON tasks(practice_id, created_at DESC);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Per-assignee status. One row per (task, profile).
-- Status flow: assigned -> in_progress -> submitted -> approved
-- Admin can also bounce submitted back to in_progress with a review_note.
CREATE TABLE task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_progress', 'submitted', 'approved')),
  completed_at timestamptz,
  approved_at timestamptz,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 2000),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, profile_id)
);

CREATE INDEX idx_task_assignments_assignee
  ON task_assignments(profile_id, practice_id, status);
CREATE INDEX idx_task_assignments_task
  ON task_assignments(task_id);

ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_comments_task
  ON task_comments(task_id, created_at ASC);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: is the caller assigned to this task?
-- (SECURITY DEFINER so RLS doesn't recurse on task_assignments)
-- ============================================================
CREATE OR REPLACE FUNCTION is_task_assignee(t_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_assignments
    WHERE task_id = t_id
      AND profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Triggers: keep updated_at fresh + bump task on assignment/comment changes
-- ============================================================
CREATE OR REPLACE FUNCTION bump_task_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE tasks
    SET updated_at = now()
    WHERE id = COALESCE(NEW.task_id, OLD.task_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_task_assignment_change
  AFTER INSERT OR UPDATE ON task_assignments
  FOR EACH ROW EXECUTE FUNCTION bump_task_updated_at();

CREATE TRIGGER on_task_comment_insert
  AFTER INSERT ON task_comments
  FOR EACH ROW EXECUTE FUNCTION bump_task_updated_at();

CREATE OR REPLACE FUNCTION bump_assignment_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_assignment_update
  BEFORE UPDATE ON task_assignments
  FOR EACH ROW EXECUTE FUNCTION bump_assignment_updated_at();

-- ============================================================
-- RLS Policies
-- ============================================================

-- tasks: admins see all in practice; assignees see tasks they're on
CREATE POLICY "Admins read all tasks"
  ON tasks FOR SELECT
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Assignees read their tasks"
  ON tasks FOR SELECT
  USING (practice_id = get_practice_id() AND is_task_assignee(id));

CREATE POLICY "Admins create tasks"
  ON tasks FOR INSERT
  WITH CHECK (
    practice_id = get_practice_id()
    AND is_admin()
    AND created_by = auth.uid()
  );

CREATE POLICY "Admins update tasks"
  ON tasks FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete tasks"
  ON tasks FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());

-- task_assignments: admins manage all; anyone assigned to a task can see
-- everyone assigned to that same task (covers "own row" trivially, plus
-- lets the UI show "Lesley + 2 others")
CREATE POLICY "Admins read all assignments"
  ON task_assignments FOR SELECT
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Assignees read peer assignments"
  ON task_assignments FOR SELECT
  USING (practice_id = get_practice_id() AND is_task_assignee(task_id));

CREATE POLICY "Admins create assignments"
  ON task_assignments FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update any assignment"
  ON task_assignments FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Assignees update own assignment"
  ON task_assignments FOR UPDATE
  USING (practice_id = get_practice_id() AND profile_id = auth.uid())
  WITH CHECK (
    practice_id = get_practice_id()
    AND profile_id = auth.uid()
    -- Employees cannot self-approve
    AND status IN ('assigned', 'in_progress', 'submitted')
  );

CREATE POLICY "Admins delete assignments"
  ON task_assignments FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());

-- task_comments: admins + any assignee on the task
CREATE POLICY "Admins read all task comments"
  ON task_comments FOR SELECT
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Assignees read task comments"
  ON task_comments FOR SELECT
  USING (practice_id = get_practice_id() AND is_task_assignee(task_id));

CREATE POLICY "Admins write task comments"
  ON task_comments FOR INSERT
  WITH CHECK (
    practice_id = get_practice_id()
    AND is_admin()
    AND profile_id = auth.uid()
  );

CREATE POLICY "Assignees write task comments"
  ON task_comments FOR INSERT
  WITH CHECK (
    practice_id = get_practice_id()
    AND profile_id = auth.uid()
    AND is_task_assignee(task_id)
  );

CREATE POLICY "Admins delete task comments"
  ON task_comments FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());
