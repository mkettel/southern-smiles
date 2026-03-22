-- ============================================================
-- SEED DATA: Condition Playbooks
-- ============================================================
insert into condition_playbooks (condition, display_name, color, description, steps) values
('affluence', 'Affluence', '#22c55e', 'Steep upward trend (>20% increase)',
 '["Economize — identify areas needing better financial control", "Pay every bill you can", "Invest the remainder into service facilities and growth", "Prepare for future delivery", "Analyze what caused the uptrend — how can we strengthen it?"]'::jsonb),
('normal', 'Normal', '#3b82f6', 'Slight upward trend (1-20% increase)',
 '["Don''t change anything that''s working", "Apply mild ethics — don''t overreact to small fluctuations", "If a stat increased, what caused it? How can we reinforce it?", "If a stat decreased, why? How can we fix it?", "Continue steady operations"]'::jsonb),
('emergency', 'Emergency', '#f59e0b', 'Flat or slight decline (0% to -15%)',
 '["Promote and PRODUCE — take immediate action", "Change your operating basis — what you were doing isn''t working", "Economize — cut non-essential expenses", "Prepare to deliver — get ready for increased production", "Stiffen discipline on procedures and hat-wearing"]'::jsonb),
('danger', 'Danger', '#f97316', 'Significant decline (-15% to -40%)',
 '["Handle the specific situation causing the drop", "Assign specific conditions by area to each sub-function", "Tighten up ethics and discipline", "Get external help or training if needed"]'::jsonb),
('non_existence', 'Non-Existence', '#ef4444', 'Severe decline (>40% drop)',
 '["Find a communication line — who do you report to?", "Make yourself known — communicate your presence and willingness", "Discover what is needed and wanted", "Do it, produce it, and/or present it", "Don''t wait — take immediate massive action"]'::jsonb);

-- ============================================================
-- SEED DATA: Divisions
-- ============================================================
insert into divisions (id, number, name) values
('d0000001-0000-0000-0000-000000000001', 2, 'Communication'),
('d0000002-0000-0000-0000-000000000002', 3, 'Treasury'),
('d0000003-0000-0000-0000-000000000003', 4, 'Production'),
('d0000004-0000-0000-0000-000000000004', 6, 'Public');

-- ============================================================
-- SEED DATA: Posts
-- ============================================================
insert into posts (id, title, division_id) values
-- Div 2 - Communication
('a0000001-0000-0000-0000-000000000001', 'Receptionist',              'd0000001-0000-0000-0000-000000000001'),
('a0000002-0000-0000-0000-000000000002', 'Scheduling Coordinator',    'd0000001-0000-0000-0000-000000000001'),
-- Div 3 - Treasury
('a0000003-0000-0000-0000-000000000003', 'Financial Coordinator',     'd0000002-0000-0000-0000-000000000002'),
('a0000004-0000-0000-0000-000000000004', 'TX Coordinator',            'd0000002-0000-0000-0000-000000000002'),
-- Div 4 - Production
('a0000005-0000-0000-0000-000000000005', 'Doctor',                    'd0000003-0000-0000-0000-000000000003'),
-- Div 6 - Public
('a0000006-0000-0000-0000-000000000006', 'PR Officer',                'd0000004-0000-0000-0000-000000000004');

-- ============================================================
-- SEED DATA: Stats (12 KPIs)
-- ============================================================
insert into stats (id, name, abbreviation, stat_type, good_direction, post_id, display_order) values
-- Receptionist stats
('b0000001-0000-0000-0000-000000000001', 'Bulk Mail Out',              'BMO',   'count',      'up',   'a0000001-0000-0000-0000-000000000001', 1),
('b0000002-0000-0000-0000-000000000002', 'Personalized Outflow',       'PO',    'count',      'up',   'a0000001-0000-0000-0000-000000000001', 2),
-- Scheduling Coordinator stats
('b0000003-0000-0000-0000-000000000003', '% Appointments Kept',        'Appts', 'percentage', 'up',   'a0000002-0000-0000-0000-000000000002', 1),
('b0000004-0000-0000-0000-000000000004', '% Recall Appointments Kept', 'Recall','percentage', 'up',   'a0000002-0000-0000-0000-000000000002', 2),
-- Financial Coordinator stats
('b0000005-0000-0000-0000-000000000005', 'Collections',                'Coll',  'dollar',     'up',   'a0000003-0000-0000-0000-000000000003', 1),
('b0000006-0000-0000-0000-000000000006', 'Accounts Receivable',        'A/R',   'dollar',     'down', 'a0000003-0000-0000-0000-000000000003', 2),
('b0000007-0000-0000-0000-000000000007', 'Collections/Staff',          'C/S',   'dollar',     'up',   'a0000003-0000-0000-0000-000000000003', 3),
-- TX Coordinator stats
('b0000008-0000-0000-0000-000000000008', '# Consults',                 'Cons',  'count',      'up',   'a0000004-0000-0000-0000-000000000004', 1),
('b0000009-0000-0000-0000-000000000009', '% Tx Presented/Closed',      'TxCl',  'percentage', 'up',   'a0000004-0000-0000-0000-000000000004', 2),
-- Doctor stats
('b0000010-0000-0000-0000-000000000010', 'Production',                 'Prod',  'dollar',     'up',   'a0000005-0000-0000-0000-000000000005', 1),
-- PR Officer stats
('b0000011-0000-0000-0000-000000000011', 'New Reaches',                'Reach', 'count',      'up',   'a0000006-0000-0000-0000-000000000006', 1),
('b0000012-0000-0000-0000-000000000012', 'New Patients',               'NP',    'count',      'up',   'a0000006-0000-0000-0000-000000000006', 2);

-- ============================================================
-- NOTE: Employee profiles + employee_posts are created after
-- auth users are set up in Supabase (the trigger auto-creates
-- profiles). The historical_data.sql script handles both
-- post assignments and all historical data import.
-- ============================================================
