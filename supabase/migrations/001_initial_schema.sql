-- ============================================================
-- Southern Smiles Stats & Conditions — Database Schema
-- ============================================================

-- ENUMS
create type stat_type as enum ('dollar', 'percentage', 'count');
create type good_direction as enum ('up', 'down');
create type condition_name as enum (
  'affluence', 'normal', 'emergency', 'danger', 'non_existence'
);
create type user_role as enum ('admin', 'employee');

-- ============================================================
-- DIVISIONS
-- ============================================================
create table divisions (
  id          uuid primary key default gen_random_uuid(),
  number      int not null,
  name        text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- POSTS (roles within a division)
-- ============================================================
create table posts (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  division_id   uuid not null references divisions(id) on delete cascade,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- PROFILES (linked to auth.users)
-- ============================================================
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null unique,
  role        user_role not null default 'employee',
  is_active   boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- EMPLOYEE_POSTS (many-to-many: one person can hold multiple posts)
-- ============================================================
create table employee_posts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  post_id     uuid not null references posts(id) on delete cascade,
  assigned_at timestamptz default now(),
  unique(profile_id, post_id)
);

-- ============================================================
-- STATS (the KPIs to track)
-- ============================================================
create table stats (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  abbreviation    text,
  stat_type       stat_type not null,
  good_direction  good_direction not null default 'up',
  post_id         uuid not null references posts(id) on delete cascade,
  display_order   int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- STAT_ENTRIES (weekly data points — core table)
-- ============================================================
create table stat_entries (
  id                    uuid primary key default gen_random_uuid(),
  stat_id               uuid not null references stats(id) on delete cascade,
  profile_id            uuid not null references profiles(id) on delete cascade,
  week_start            date not null,
  value                 numeric(12,2) not null,
  previous_value        numeric(12,2),
  percent_change        numeric(8,4),
  auto_condition        condition_name,
  self_condition        condition_name,
  final_condition       condition_name,
  playbook_response     text,
  submitted_at          timestamptz default now(),
  updated_at            timestamptz default now(),
  unique(stat_id, profile_id, week_start)
);

-- ============================================================
-- CONDITION_PLAYBOOKS
-- ============================================================
create table condition_playbooks (
  id              uuid primary key default gen_random_uuid(),
  condition       condition_name not null unique,
  display_name    text not null,
  color           text not null,
  description     text not null,
  steps           jsonb not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- OIC_LOG (Officer In Charge operational log)
-- ============================================================
create table oic_log (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  effective_date date not null,
  area          text,
  post_affected text,
  entry_text    text not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_stat_entries_stat_week on stat_entries(stat_id, week_start desc);
create index idx_stat_entries_profile_week on stat_entries(profile_id, week_start desc);
create index idx_stat_entries_week on stat_entries(week_start desc);
create index idx_stats_post on stats(post_id);
create index idx_employee_posts_profile on employee_posts(profile_id);
create index idx_oic_log_date on oic_log(effective_date desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table divisions enable row level security;
alter table posts enable row level security;
alter table employee_posts enable row level security;
alter table stats enable row level security;
alter table stat_entries enable row level security;
alter table condition_playbooks enable row level security;
alter table oic_log enable row level security;

-- Helper: is current user an admin?
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- PROFILES
create policy "Users can read own profile"
  on profiles for select using (id = auth.uid());
create policy "Admins can read all profiles"
  on profiles for select using (is_admin());
create policy "Admins can insert profiles"
  on profiles for insert with check (is_admin());
create policy "Admins can update profiles"
  on profiles for update using (is_admin());
create policy "Admins can delete profiles"
  on profiles for delete using (is_admin());

-- DIVISIONS (read all, write admin)
create policy "Authenticated can read divisions"
  on divisions for select using (auth.uid() is not null);
create policy "Admins can insert divisions"
  on divisions for insert with check (is_admin());
create policy "Admins can update divisions"
  on divisions for update using (is_admin());
create policy "Admins can delete divisions"
  on divisions for delete using (is_admin());

-- POSTS (read all, write admin)
create policy "Authenticated can read posts"
  on posts for select using (auth.uid() is not null);
create policy "Admins can insert posts"
  on posts for insert with check (is_admin());
create policy "Admins can update posts"
  on posts for update using (is_admin());
create policy "Admins can delete posts"
  on posts for delete using (is_admin());

-- EMPLOYEE_POSTS
create policy "Users can read own assignments"
  on employee_posts for select using (profile_id = auth.uid());
create policy "Admins can read all assignments"
  on employee_posts for select using (is_admin());
create policy "Admins can insert assignments"
  on employee_posts for insert with check (is_admin());
create policy "Admins can update assignments"
  on employee_posts for update using (is_admin());
create policy "Admins can delete assignments"
  on employee_posts for delete using (is_admin());

-- STATS (read all, write admin)
create policy "Authenticated can read stats"
  on stats for select using (auth.uid() is not null);
create policy "Admins can insert stats"
  on stats for insert with check (is_admin());
create policy "Admins can update stats"
  on stats for update using (is_admin());
create policy "Admins can delete stats"
  on stats for delete using (is_admin());

-- STAT_ENTRIES
create policy "Users can read own entries"
  on stat_entries for select using (profile_id = auth.uid());
create policy "Users can insert own entries"
  on stat_entries for insert with check (profile_id = auth.uid());
create policy "Users can update own entries"
  on stat_entries for update using (profile_id = auth.uid());
create policy "Admins can read all entries"
  on stat_entries for select using (is_admin());
create policy "Admins can insert entries"
  on stat_entries for insert with check (is_admin());
create policy "Admins can update entries"
  on stat_entries for update using (is_admin());
create policy "Admins can delete entries"
  on stat_entries for delete using (is_admin());

-- CONDITION_PLAYBOOKS (read all, write admin)
create policy "Authenticated can read playbooks"
  on condition_playbooks for select using (auth.uid() is not null);
create policy "Admins can insert playbooks"
  on condition_playbooks for insert with check (is_admin());
create policy "Admins can update playbooks"
  on condition_playbooks for update using (is_admin());

-- OIC_LOG
create policy "Authenticated can read oic_log"
  on oic_log for select using (auth.uid() is not null);
create policy "Admins can insert oic_log"
  on oic_log for insert with check (is_admin());
create policy "Admins can update oic_log"
  on oic_log for update using (is_admin());
create policy "Admins can delete oic_log"
  on oic_log for delete using (is_admin());

-- ============================================================
-- AUTO-CREATE PROFILE ON AUTH SIGNUP (trigger)
-- ============================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'employee')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
