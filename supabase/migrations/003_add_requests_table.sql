-- ============================================================
-- Feature Requests & Bug Reports board (admin-only)
-- ============================================================

create type request_type as enum ('bug', 'feature', 'improvement');
create type request_priority as enum ('low', 'medium', 'high');

create table requests (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  type            request_type not null default 'feature',
  priority        request_priority not null default 'medium',
  is_completed    boolean not null default false,
  created_by      uuid not null references profiles(id) on delete cascade,
  created_at      timestamptz default now(),
  completed_at    timestamptz
);

create index idx_requests_status on requests(is_completed, created_at desc);

-- RLS: admin-only
alter table requests enable row level security;

create policy "Admins can read requests"
  on requests for select using (is_admin());
create policy "Admins can insert requests"
  on requests for insert with check (is_admin());
create policy "Admins can update requests"
  on requests for update using (is_admin());
create policy "Admins can delete requests"
  on requests for delete using (is_admin());
