-- Comments/chat thread for feature requests
create table request_comments (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references requests(id) on delete cascade,
  profile_id      uuid not null references profiles(id) on delete cascade,
  message         text not null,
  created_at      timestamptz default now()
);

create index idx_request_comments_request on request_comments(request_id, created_at asc);

alter table request_comments enable row level security;

create policy "Admins can read comments"
  on request_comments for select using (is_admin());
create policy "Admins can insert comments"
  on request_comments for insert with check (is_admin());
create policy "Admins can delete comments"
  on request_comments for delete using (is_admin());
