-- Additive only: no UPDATE/DELETE/backfill of any existing Board rows.
create table public.care_call_sync_days (
 entry_date date primary key check(entry_date >= date '2026-10-26'),
 vault_count integer check(vault_count between 0 and 1000000),
 additional_count integer not null default 0 check(additional_count between 0 and 1000000),
 source_revision bigint,
 synced_at timestamptz,
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.care_call_sync_days enable row level security;
revoke all on public.care_call_sync_days from public,anon,authenticated;
grant select,insert,update on public.care_call_sync_days to service_role;
alter table public.stat_entries add column if not exists override_reason text;

-- All writes for this one metric serialize under the same lock, including
-- weekly overrides. The generic stat editors are blocked for managed dates.
create function public.manage_care_call_sync(p_operation text,p_date date,p_value integer default null,p_revision bigint default null,p_actor uuid default null,p_reason text default null)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 s constant uuid := '3b8ff011-e57d-4be7-89d2-d98b9070da0f';
 tenant constant uuid := '4410400a-84eb-4984-a7f9-68661bdb5213';
 system_actor constant uuid := 'd6c19e94-7cce-41c7-be32-e21eaeedc0a7';
 w date; d care_call_sync_days%rowtype; r stat_entries%rowtype;
 calculated numeric; effective numeric; previous numeric; pct numeric; cond condition_name;
 actor uuid; today date := (now() at time zone 'America/Phoenix')::date;
begin
 if p_date is null or p_date < date '2026-10-26' or today < date '2026-10-26' then raise exception 'Before integration start'; end if;
 if p_date > today then raise exception 'Future date'; end if;
 if not exists(select 1 from stats where id=s and practice_id=tenant and stat_type='count' and weekly_formula='sum' and good_direction='up') then raise exception 'Care Calls configuration mismatch'; end if;
 if p_operation not in ('snapshot','additional','override','reset') or p_operation is null then raise exception 'Invalid operation'; end if;
 if p_operation <> 'reset' and (p_value is null or p_value<0 or p_value>1000000) then raise exception 'Invalid count'; end if;
 actor:=case when p_operation='snapshot' then system_actor else p_actor end;
 if not exists(select 1 from profiles p where p.id=actor and p.practice_id=tenant and (p.role='admin' or exists(select 1 from employee_posts ep join stats st on st.post_id=ep.post_id where ep.profile_id=p.id and st.id=s))) then raise exception 'Not assigned to Care Calls'; end if;
 w:=p_date-((extract(isodow from p_date)::integer)-1);
 if p_operation in ('override','reset') and p_date<>w then raise exception 'Use Monday week start'; end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text,0));
 perform set_config('app.care_call_sync','on',true);
 if p_operation in ('snapshot','additional') and exists(select 1 from stat_entries where stat_id=s and week_start=w and not is_manual_override) and not exists(select 1 from care_call_sync_days where entry_date between w and w+6) then raise exception 'Existing weekly total needs review; no numbers overwritten'; end if;
 if p_operation in ('snapshot','additional') then
  select * into d from care_call_sync_days where entry_date=p_date;
  if not found and exists(select 1 from daily_stat_entries where stat_id=s and entry_date=p_date) then raise exception 'Existing manual day needs review; no numbers overwritten'; end if;
  if p_operation='snapshot' then
   if p_date>=today or p_revision is null or p_revision<=0 or p_revision>extract(epoch from now())*1000+300000 then raise exception 'Invalid snapshot revision/date'; end if;
   if d.source_revision is not null and p_revision<=d.source_revision then return; end if;
   if d.vault_count is not null and p_value<d.vault_count then raise exception 'Immutable attempt count cannot decrease'; end if;
   insert into care_call_sync_days(entry_date,vault_count,source_revision,synced_at,updated_by) values(p_date,p_value,p_revision,now(),actor)
   on conflict(entry_date) do update set vault_count=excluded.vault_count,source_revision=excluded.source_revision,synced_at=now(),updated_at=now();
  else
   insert into care_call_sync_days(entry_date,additional_count,updated_by) values(p_date,p_value,actor)
   on conflict(entry_date) do update set additional_count=excluded.additional_count,updated_by=actor,updated_at=now();
  end if;
  select * into d from care_call_sync_days where entry_date=p_date;
  insert into daily_stat_entries(practice_id,stat_id,profile_id,entry_date,week_start,input_value,value)
  values(tenant,s,actor,p_date,w,d.additional_count,coalesce(d.vault_count,0)+d.additional_count)
  on conflict(stat_id,entry_date) do update set input_value=excluded.input_value,value=excluded.value,updated_at=now(),profile_id=actor;
 end if;
 select sum(value) into calculated from daily_stat_entries where stat_id=s and week_start=w;
 select * into r from stat_entries where stat_id=s and week_start=w;
 -- Never silently replace a preexisting weekly figure without provenance.
 if found and not r.is_manual_override and not exists(select 1 from care_call_sync_days where entry_date between w and w+6) then raise exception 'Existing weekly total needs review'; end if;
 if p_operation='override' then
  if nullif(btrim(p_reason),'') is null or length(p_reason)>200 then raise exception 'Override reason required'; end if;
  effective:=p_value;
 elsif p_operation='reset' then
  if calculated is null then raise exception 'No calculated total yet'; end if;
  effective:=calculated;
 else
  effective:=case when r.is_manual_override then r.value else calculated end;
 end if;
 if effective is null then return; end if;
 insert into stat_entries(stat_id,profile_id,practice_id,week_start,value,calculated_value,is_manual_override,override_reason,updated_by)
 values(s,actor,tenant,w,effective,calculated,case when p_operation='override' then true when p_operation='reset' then false else coalesce(r.is_manual_override,false) end,case when p_operation='override' then btrim(p_reason) when p_operation='reset' then null else r.override_reason end,actor)
 on conflict(stat_id,week_start) do update set value=excluded.value,calculated_value=excluded.calculated_value,is_manual_override=excluded.is_manual_override,override_reason=excluded.override_reason,updated_by=actor,updated_at=now();
 -- Recompute condition from the EFFECTIVE number, including overrides.
 -- Later integrated weeks also receive a corrected previous-value chain.
 for r in select * from stat_entries where stat_id=s and week_start>=w order by week_start loop
  select value into previous from stat_entries where stat_id=s and week_start<r.week_start order by week_start desc limit 1;
  if previous is null then pct:=0;cond:='non_existence';
  elsif previous=0 then pct:=case when r.value=0 then 0 else 100 end;cond:=case when r.value=0 then 'normal'::condition_name else 'power'::condition_name end;
  else
   pct:=(r.value-previous)/abs(previous)*100;
   cond:=case when pct>50 then 'power'::condition_name when pct>20 then 'affluence'::condition_name when pct>0 then 'normal'::condition_name when pct>=-15 then 'emergency'::condition_name when pct>=-40 then 'danger'::condition_name else 'non_existence'::condition_name end;
  end if;
  update stat_entries set previous_value=previous,percent_change=round(pct,2),auto_condition=cond,self_condition=coalesce(self_condition,cond) where id=r.id;
 end loop;
end $$;
revoke all on function public.manage_care_call_sync(text,date,integer,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.manage_care_call_sync(text,date,integer,bigint,uuid,text) to service_role;

-- Old browser builds/direct Data API edits must not replace integrated totals.
create function public.guard_care_call_projection() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare protected boolean;
begin
 if tg_op='DELETE' then
  protected:=old.stat_id='3b8ff011-e57d-4be7-89d2-d98b9070da0f' and old.week_start>=date '2026-10-26';
 else
  protected:=new.stat_id='3b8ff011-e57d-4be7-89d2-d98b9070da0f' and new.week_start>=date '2026-10-26';
  if tg_op='UPDATE' then
   protected:=protected or (old.stat_id='3b8ff011-e57d-4be7-89d2-d98b9070da0f' and old.week_start>=date '2026-10-26');
   -- Condition/playbook edits remain available, but numeric provenance cannot change.
   if tg_table_name='stat_entries' then
    if new.stat_id=old.stat_id and new.week_start=old.week_start and new.value is not distinct from old.value and new.calculated_value is not distinct from old.calculated_value and new.is_manual_override is not distinct from old.is_manual_override and new.override_reason is not distinct from old.override_reason then return new; end if;
   end if;
  end if;
 end if;
 if protected and (current_user<>'service_role' or coalesce(current_setting('app.care_call_sync',true),'')<>'on') then raise exception 'Use the dedicated Care Calls adjustment controls'; end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
revoke all on function public.guard_care_call_projection() from public,anon,authenticated;
create trigger guard_care_daily before insert or update or delete on public.daily_stat_entries for each row execute function public.guard_care_call_projection();
create trigger guard_care_weekly before insert or update or delete on public.stat_entries for each row execute function public.guard_care_call_projection();
