-- Run with the migration inside BEGIN/ROLLBACK, never commit fixture numbers.
set local role service_role;
do $$
declare
 s uuid := 'b0000011-0000-0000-0000-000000000011';
 actor uuid := 'd6c19e94-7cce-41c7-be32-e21eaeedc0a7';
 rev bigint := (extract(epoch from now())*1000)::bigint;
 v numeric;
 n numeric;
 blocked boolean;
begin
 if exists(select 1 from daily_stat_entries where stat_id=s and entry_date>='2026-11-16') then
  raise exception 'Fixture dates already contain real data; choose isolated test environment';
 end if;
 perform manage_new_reach_sync('additional','2026-11-16',2,null,actor);
 perform sync_vault_new_reaches('2026-11-16',5,rev);
 select value into v from daily_stat_entries where stat_id=s and entry_date='2026-11-16';
 if v<>7 then raise exception 'Additions lost: %',v; end if;
 perform sync_vault_new_reaches('2026-11-16',100,rev);
 perform sync_vault_new_reaches('2026-11-16',100,rev-1);
 select value into v from daily_stat_entries where stat_id=s and entry_date='2026-11-16';
 if v<>7 then raise exception 'Duplicate/stale revision changed count'; end if;
 perform manage_new_reach_sync('override','2026-11-16',20,null,actor,'Rollback-only verification');
 insert into daily_stat_entries(stat_id,practice_id,profile_id,entry_date,week_start,input_value,value)
 values('e8e5a233-35cc-403e-a356-941e30a29668','4410400a-84eb-4984-a7f9-68661bdb5213',actor,'2026-11-16','2026-11-16',2,2)
 on conflict(stat_id,entry_date) do update set value=2;
 select sum(value) into n from daily_stat_entries where stat_id='e8e5a233-35cc-403e-a356-941e30a29668' and week_start='2026-11-16';
 perform sync_vault_new_reaches('2026-11-16',3,rev+1);
 select value into v from stat_entries where stat_id='bc02918c-29ef-408c-b7ae-8d0b02d1351d' and week_start='2026-11-16';
 if v is distinct from (n*100/20) then raise exception 'Conversion ignored reported override: %',v; end if;
 select value into v from stat_entries where stat_id=s and week_start='2026-11-16';
 if v<>20 then raise exception 'Override lost'; end if;
 select calculated_value into v from stat_entries where stat_id=s and week_start='2026-11-16';
 if v<>5 then raise exception 'Calculated total failed to follow correction'; end if;
 perform manage_new_reach_sync('reset','2026-11-16',null,null,actor);
 select value into v from stat_entries where stat_id=s and week_start='2026-11-16';
 if v<>5 then raise exception 'Reset failed'; end if;
 select value into v from stat_entries where stat_id='bc02918c-29ef-408c-b7ae-8d0b02d1351d' and week_start='2026-11-16';
 if v is distinct from (n*100/5) then raise exception 'Conversion reset failed: %',v; end if;
 perform manage_new_reach_sync('additional','2026-11-16',4,null,actor);
 select value into v from stat_entries where stat_id=s and week_start='2026-11-16';
 if v<>7 then raise exception 'Edit addition should replace not increment'; end if;
 blocked:=false;
 begin
  perform manage_new_reach_sync('additional','2026-11-16',1,null,'00000000-0000-0000-0000-000000000000');
 exception when others then blocked:=true;
 end;
 if not blocked then raise exception 'Unauthorized actor accepted'; end if;
 blocked:=false;
 begin
  perform sync_vault_new_reaches('2026-11-15',1,rev);
 exception when others then blocked:=true;
 end;
 if not blocked then raise exception 'Pre-cutover date accepted'; end if;
 perform set_config('app.new_reach_sync','off',true);
 blocked:=false;
 begin
  update daily_stat_entries set value=999 where stat_id=s and entry_date='2026-11-16';
 exception when others then blocked:=true;
 end;
 if not blocked then raise exception 'Direct write to managed data accepted'; end if;
end $$;
select 'PASS: additions, corrections, overrides, reset, replay, cutover, and direct-write protection' as verification;
