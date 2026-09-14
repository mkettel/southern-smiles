create table public.oic_action_suggestions (
  practice_id uuid not null references public.practices(id),
  id text not null,
  source_key text not null,
  original_draft jsonb not null,
  draft jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  oic_entry_id uuid references public.oic_log(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (practice_id, id),
  unique (practice_id, source_key),
  check (jsonb_typeof(draft) = 'object' and jsonb_typeof(original_draft) = 'object')
);
create index oic_action_suggestions_queue on public.oic_action_suggestions(practice_id, status, updated_at desc);
create table public.oic_action_suggestion_events (
  id bigint generated always as identity primary key,
  practice_id uuid not null,
  suggestion_id text not null,
  actor_id uuid not null references public.profiles(id),
  operation text not null,
  draft jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (practice_id, suggestion_id) references public.oic_action_suggestions(practice_id, id)
);
alter table public.oic_action_suggestions enable row level security;
alter table public.oic_action_suggestion_events enable row level security;
-- Only authenticated server actions use the service client. No direct browser access.
revoke all on public.oic_action_suggestions, public.oic_action_suggestion_events from public, anon, authenticated;
grant select, insert, update on public.oic_action_suggestions to service_role;
grant select, insert on public.oic_action_suggestion_events to service_role;
grant usage, select on sequence public.oic_action_suggestion_events_id_seq to service_role;

create function public.manage_oic_action_suggestions(
  p_practice_id uuid, p_actor_id uuid, p_operation text, p_items jsonb
) returns integer
language plpgsql security invoker set search_path = '' as $$
<<review_batch>>
declare
  item jsonb; draft jsonb; existing public.oic_action_suggestions%rowtype;
  entry_id uuid; entry_text text; effective date; new_status text;
  changed integer := 0;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and practice_id = p_practice_id and role = 'admin' and is_active) then
    raise exception 'Active practice administrator required';
  end if;
  if p_operation not in ('import', 'save', 'accept', 'dismiss', 'restore') or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then
    raise exception 'Invalid operation or batch';
  end if;
  -- Serialize a practice batch, including duplicate checks and the OIC insert.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_practice_id::text, 931));
  for item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if p_operation = 'import' then
      if length(coalesce(item->>'id', '')) not between 1 and 200 or length(coalesce(item->>'source_key', '')) not between 1 and 300 or length(trim(coalesce(item->>'title', ''))) = 0 or length(trim(coalesce(item->>'entry_text', ''))) = 0 then
        raise exception 'Invalid draft';
      end if;
      draft := item || '{"date_confirmed":false,"implementation":"unconfirmed"}'::jsonb;
      if exists (select 1 from public.oic_action_suggestions s where s.practice_id = p_practice_id and (
        s.id = item->>'id' or s.source_key = item->>'source_key' or (
          s.draft->>'effective_date' = review_batch.draft->>'effective_date' and
          regexp_replace(lower(s.draft->>'entry_text'), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(review_batch.draft->>'entry_text'), '[^a-z0-9]+', '', 'g')
        ))) then continue; end if;
      insert into public.oic_action_suggestions(practice_id,id,source_key,original_draft,draft,created_by)
        values(p_practice_id,item->>'id',item->>'source_key',item,draft,p_actor_id);
    else
      select * into existing from public.oic_action_suggestions where practice_id = p_practice_id and id = item->>'id' for update;
      if not found then raise exception 'Suggestion not found in this practice'; end if;
      -- Retrying an already completed transition is harmless, even with an old version.
      if (p_operation = 'accept' and existing.status = 'accepted') or (p_operation = 'dismiss' and existing.status = 'dismissed') or (p_operation = 'restore' and existing.status = 'pending') then continue; end if;
      if existing.version <> (item->>'version')::integer or item->>'version' is null then raise exception 'Suggestion changed. Refresh and review again.'; end if;
      if existing.status = 'accepted' then raise exception 'Edit accepted entries in the Action Log'; end if;
      draft := existing.draft;
      new_status := existing.status;
      entry_id := null;
      if p_operation = 'save' then
        if existing.status <> 'pending' or jsonb_typeof(item->'draft') <> 'object' then raise exception 'Only pending drafts can be edited'; end if;
        draft := item->'draft' || jsonb_build_object('id',existing.id,'source_key',existing.source_key);
      elsif p_operation = 'accept' then
        if existing.status <> 'pending' or draft->>'implementation' is distinct from 'implemented' or draft->'date_confirmed' is distinct from 'true'::jsonb or coalesce(draft->>'effective_date','') !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception 'Confirm implementation and effective date first';
        end if;
        effective := (draft->>'effective_date')::date;
        if effective > (now() at time zone 'America/Phoenix')::date then raise exception 'Future actions cannot be accepted'; end if;
        entry_text := concat_ws(E'\n\n', draft->>'title', draft->>'entry_text',
          case when jsonb_array_length(draft->'stats') > 0 then 'Stats to watch: ' || (select string_agg(value, ', ') from jsonb_array_elements_text(draft->'stats')) end,
          'Source: ' || (draft->>'source_label') || case when coalesce(draft->>'source_url','') <> '' then ' (' || (draft->>'source_url') || ')' else '' end);
        if exists (select 1 from public.oic_log o where o.practice_id = p_practice_id and o.effective_date = effective and
          regexp_replace(lower(o.entry_text), '[^a-z0-9]+', '', 'g') in (
            regexp_replace(lower(review_batch.entry_text), '[^a-z0-9]+', '', 'g'),
            regexp_replace(lower(draft->>'entry_text'), '[^a-z0-9]+', '', 'g'))) then
          raise exception 'A matching action already exists on this date';
        end if;
        insert into public.oic_log(practice_id,profile_id,effective_date,area,post_affected,entry_text)
          values(p_practice_id,p_actor_id,effective,nullif(draft->>'area',''),nullif(draft->>'post_affected',''),entry_text) returning id into entry_id;
        new_status := 'accepted';
      elsif p_operation = 'dismiss' then new_status := 'dismissed';
      elsif p_operation = 'restore' then new_status := 'pending';
      end if;
      update public.oic_action_suggestions set draft = review_batch.draft, status = new_status,
        version = version + 1, updated_at = now(),
        reviewed_by = case when new_status = 'pending' then null else p_actor_id end,
        reviewed_at = case when new_status = 'pending' then null else now() end,
        oic_entry_id = entry_id
        where practice_id = p_practice_id and id = existing.id;
    end if;
    insert into public.oic_action_suggestion_events(practice_id,suggestion_id,actor_id,operation,draft)
      values(p_practice_id,item->>'id',p_actor_id,p_operation,draft);
    changed := changed + 1;
  end loop;
  return changed;
end;
$$;
revoke all on function public.manage_oic_action_suggestions(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.manage_oic_action_suggestions(uuid,uuid,text,jsonb) to service_role;
