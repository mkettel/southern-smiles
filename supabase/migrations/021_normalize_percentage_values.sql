-- Normalize legacy percentage values stored as 0-1 decimals to 0-100 whole numbers.
-- The historical import wrote percentages as decimals (0.78 = 78%), but the entry UI
-- submits whole numbers (78 = 78%). Rows submitted via the UI since then mix units,
-- causing numeric(8,4) overflow in percent_change when the prior row is a legacy decimal.

begin;

-- Step 1: scale value and previous_value for any percentage-stat row still in decimal form.
-- Heuristic: values < 1 are the legacy decimal encoding. Real percentages entered via the
-- UI are always >= 1 (no one enters "0.5" meaning half a percent for these stats).
update stat_entries se
set value = se.value * 100
from stats s
where s.id = se.stat_id
  and s.stat_type = 'percentage'
  and se.value is not null
  and se.value < 1
  and se.value > 0;

update stat_entries se
set previous_value = se.previous_value * 100
from stats s
where s.id = se.stat_id
  and s.stat_type = 'percentage'
  and se.previous_value is not null
  and se.previous_value < 1
  and se.previous_value > 0;

-- Step 2: recompute percent_change for all percentage rows. Some stored percent_changes
-- were computed across mismatched units (e.g. 45 vs 0.78 → +5669%). Now that units
-- are consistent, recompute cleanly. Mirrors lib/conditions.ts.
update stat_entries se
set percent_change = case
    when se.previous_value is null then 0
    when se.previous_value = 0 and se.value = 0 then 0
    when se.previous_value = 0 and se.value > 0 then 100
    when se.previous_value = 0 and se.value < 0 then -100
    else round(((se.value - se.previous_value) / abs(se.previous_value) * 100)::numeric, 4)
  end
from stats s
where s.id = se.stat_id
  and s.stat_type = 'percentage';

commit;
