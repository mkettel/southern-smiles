-- ============================================================
-- Migration 027: Add 'power' condition above 'affluence'
-- ============================================================
-- Adds a sixth condition tier for stats that grew >+50% week-over-week.
-- Affluence still covers +20% to +50%; Power is the new top tier.
--
-- Postgres won't let `ALTER TYPE ... ADD VALUE` run inside a transaction
-- block, so we rebuild the enum via rename + recreate. All columns that
-- reference the enum (auto/self/final on stat_entries, condition on
-- condition_playbooks, overall_condition on stats) are cast through text
-- and back so the new ordering takes effect.
-- ============================================================

alter type condition_name rename to condition_name_old;

create type condition_name as enum (
  'power', 'affluence', 'normal', 'emergency', 'danger', 'non_existence'
);

alter table stat_entries
  alter column auto_condition  type condition_name using auto_condition::text::condition_name,
  alter column self_condition  type condition_name using self_condition::text::condition_name,
  alter column final_condition type condition_name using final_condition::text::condition_name;

alter table condition_playbooks
  alter column condition type condition_name using condition::text::condition_name;

-- 023_add_stat_overall_condition.sql added stats.overall_condition
alter table stats
  alter column overall_condition type condition_name using overall_condition::text::condition_name;

drop type condition_name_old;

-- ============================================================
-- Seed the Power playbook
-- ============================================================
insert into condition_playbooks (condition, display_name, color, description, steps) values
('power', 'Power', '#a855f7', 'Massive upward trend (>50% increase)',
 '["Don''t disconnect — keep every line and connection that got you here", "List everything you''re doing that''s working — write it all down", "Write up your hat so the role can be replicated and protected", "Reinforce successful actions — do more of what produced the win", "Don''t change what''s working; protect the win, then build on it"]'::jsonb)
on conflict (condition) do nothing;
