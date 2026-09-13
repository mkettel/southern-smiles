create table public.accounting_source_baselines (
 practice_id uuid primary key references public.practices(id),
 document jsonb not null,
 source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
 is_active boolean not null default false,
 created_at timestamptz not null default now(),
 check (jsonb_typeof(document) = 'object'),
 check (document ?& array['version','practiceId','from','through','entries','lines','closingBalances','expectedEntryCount','expectedLineCount','sourceSha256']),
 check (document->>'practiceId' = practice_id::text),
 check (document->>'sourceSha256' = source_sha256),
 check (jsonb_array_length(document->'entries') = (document->>'expectedEntryCount')::integer),
 check (jsonb_array_length(document->'lines') = (document->>'expectedLineCount')::integer)
);
alter table public.accounting_source_baselines enable row level security;
revoke all on public.accounting_source_baselines from public, anon, authenticated, service_role;
grant select, insert on public.accounting_source_baselines to service_role;
create function public.protect_accounting_source_baseline() returns trigger
language plpgsql set search_path = '' as $$
begin
 if tg_op = 'DELETE' then raise exception 'Source baselines are retained permanently'; end if;
 if new.document is distinct from old.document or new.practice_id is distinct from old.practice_id
 or new.source_sha256 is distinct from old.source_sha256 or new.created_at is distinct from old.created_at
 then raise exception 'Source baseline content is immutable'; end if;
 return new;
end; $$;
revoke all on function public.protect_accounting_source_baseline() from public, anon, authenticated;
create trigger protect_accounting_source_baseline before update or delete on public.accounting_source_baselines
for each row execute function public.protect_accounting_source_baseline();
comment on table public.accounting_source_baselines is 'Immutable verified source ledger. Activation is separate from staging. Board journals are preserved.';
