BEGIN;

CREATE TABLE financial_loan_schedule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES financial_loans(id) ON DELETE CASCADE,
  payment_number integer NOT NULL CHECK (payment_number > 0),
  due_date date NOT NULL,
  payment_cents bigint NOT NULL CHECK (payment_cents >= 0),
  principal_cents bigint NOT NULL,
  interest_cents bigint NOT NULL CHECK (interest_cents >= 0),
  fee_cents bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  balance_after_cents bigint NOT NULL CHECK (balance_after_cents >= 0),
  source_document text NOT NULL CHECK (char_length(trim(source_document)) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (principal_cents + interest_cents + fee_cents = payment_cents),
  UNIQUE (loan_id, payment_number),
  UNIQUE (loan_id, due_date)
);

CREATE INDEX idx_financial_loan_schedule_practice_date
  ON financial_loan_schedule_entries(practice_id, due_date);
ALTER TABLE financial_loan_schedule_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_loan_schedule_entries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_loan_schedule_entries TO service_role;

WITH target AS (
  SELECT p.id AS practice_id, l.id AS loan_id, l.name
  FROM practices p
  JOIN financial_loans l ON l.practice_id = p.id
  WHERE p.slug = 'ssmiles'
    AND l.name IN ('Fundation Group 10020573', 'Intraoral scanner')
),
schedule(name, payment_number, due_date, payment_cents, principal_cents, interest_cents, fee_cents, balance_after_cents, source_document) AS (
VALUES
  ('Fundation Group 10020573', 1, DATE '2025-12-24', 74357, 66467, 7890, 0, 3094823, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 2, DATE '2026-01-09', 74357, 66633, 7724, 0, 3028190, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 3, DATE '2026-01-24', 74357, 66799, 7558, 0, 2961391, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 4, DATE '2026-02-09', 74357, 66966, 7391, 0, 2894425, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 5, DATE '2026-02-24', 74357, 67133, 7224, 0, 2827292, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 6, DATE '2026-03-09', 74357, 67300, 7057, 0, 2759992, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 7, DATE '2026-03-24', 74357, 67469, 6888, 0, 2692523, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 8, DATE '2026-04-09', 74357, 67637, 6720, 0, 2624886, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 9, DATE '2026-04-24', 74357, 67806, 6551, 0, 2557080, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 10, DATE '2026-05-09', 74357, 67975, 6382, 0, 2489105, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 11, DATE '2026-05-24', 74357, 68144, 6213, 0, 2420961, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 12, DATE '2026-06-09', 74357, 68315, 6042, 0, 2352646, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 13, DATE '2026-06-24', 74357, 68485, 5872, 0, 2284161, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 14, DATE '2026-07-09', 74357, 68656, 5701, 0, 2215505, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 15, DATE '2026-07-24', 74357, 68828, 5529, 0, 2146677, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 16, DATE '2026-08-09', 74357, 68999, 5358, 0, 2077678, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 17, DATE '2026-08-24', 74357, 69171, 5186, 0, 2008507, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 18, DATE '2026-09-09', 74357, 69344, 5013, 0, 1939163, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 19, DATE '2026-09-24', 74357, 69518, 4839, 0, 1869645, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 20, DATE '2026-10-09', 74357, 69690, 4667, 0, 1799955, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 21, DATE '2026-10-24', 74357, 69865, 4492, 0, 1730090, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 22, DATE '2026-11-09', 74357, 70039, 4318, 0, 1660051, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 23, DATE '2026-11-24', 74357, 70214, 4143, 0, 1589837, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 24, DATE '2026-12-09', 74357, 70389, 3968, 0, 1519448, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 25, DATE '2026-12-24', 74357, 70564, 3793, 0, 1448884, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 26, DATE '2027-01-09', 74357, 70741, 3616, 0, 1378143, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 27, DATE '2027-01-24', 74357, 70918, 3439, 0, 1307225, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 28, DATE '2027-02-09', 74357, 71094, 3263, 0, 1236131, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 29, DATE '2027-02-24', 74357, 71272, 3085, 0, 1164859, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 30, DATE '2027-03-09', 74357, 71450, 2907, 0, 1093409, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 31, DATE '2027-03-24', 74357, 71628, 2729, 0, 1021781, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 32, DATE '2027-04-09', 74357, 71806, 2551, 0, 949975, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 33, DATE '2027-04-24', 74357, 71986, 2371, 0, 877989, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 34, DATE '2027-05-09', 74357, 72166, 2191, 0, 805823, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 35, DATE '2027-05-24', 74357, 72346, 2011, 0, 733477, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 36, DATE '2027-06-09', 74357, 72526, 1831, 0, 660951, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 37, DATE '2027-06-24', 74357, 72708, 1649, 0, 588243, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 38, DATE '2027-07-09', 74357, 72888, 1469, 0, 515355, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 39, DATE '2027-07-24', 74357, 73071, 1286, 0, 442284, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 40, DATE '2027-08-09', 74357, 73253, 1104, 0, 369031, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 41, DATE '2027-08-24', 74357, 73436, 921, 0, 295595, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 42, DATE '2027-09-09', 74357, 73620, 737, 0, 221975, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 43, DATE '2027-09-24', 74357, 73803, 554, 0, 148172, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 44, DATE '2027-10-09', 74357, 73987, 370, 0, 74185, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Fundation Group 10020573', 45, DATE '2027-10-24', 74370, 74185, 185, 0, 0, 'Quantum Lending Solutions amortization schedule, 2025-12-18'),
  ('Intraoral scanner', 1, DATE '2024-05-17', 0, 0, 0, 0, 1714000, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 2, DATE '2024-06-17', 0, -3357, 3357, 0, 1717357, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 3, DATE '2024-07-17', 0, -3363, 3363, 0, 1720720, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 4, DATE '2024-08-17', 0, -3370, 3370, 0, 1724090, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 5, DATE '2024-09-17', 0, -3376, 3376, 0, 1727466, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 6, DATE '2024-10-17', 0, -3383, 3383, 0, 1730849, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 7, DATE '2024-11-17', 49845, 46455, 3390, 0, 1684394, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 8, DATE '2024-12-17', 49845, 46546, 3299, 0, 1637848, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 9, DATE '2025-01-17', 49845, 46638, 3207, 0, 1591210, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 10, DATE '2025-02-17', 49845, 46729, 3116, 0, 1544481, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 11, DATE '2025-03-17', 49845, 46820, 3025, 0, 1497661, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 12, DATE '2025-04-17', 49845, 46912, 2933, 0, 1450749, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 13, DATE '2025-05-17', 49845, 47004, 2841, 0, 1403745, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 14, DATE '2025-06-17', 49845, 47096, 2749, 0, 1356649, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 15, DATE '2025-07-17', 49845, 47188, 2657, 0, 1309461, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 16, DATE '2025-08-17', 49845, 47281, 2564, 0, 1262180, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 17, DATE '2025-09-17', 49845, 47373, 2472, 0, 1214807, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 18, DATE '2025-10-17', 49845, 47466, 2379, 0, 1167341, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 19, DATE '2025-11-17', 49845, 47559, 2286, 0, 1119782, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 20, DATE '2025-12-17', 49845, 47652, 2193, 0, 1072130, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 21, DATE '2026-01-17', 49845, 47745, 2100, 0, 1024385, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 22, DATE '2026-02-17', 49845, 47839, 2006, 0, 976546, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 23, DATE '2026-03-17', 49845, 47933, 1912, 0, 928613, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 24, DATE '2026-04-17', 49845, 48026, 1819, 0, 880587, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 25, DATE '2026-05-17', 49845, 48121, 1724, 0, 832466, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 26, DATE '2026-06-17', 49845, 48215, 1630, 0, 784251, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 27, DATE '2026-07-17', 49845, 48309, 1536, 0, 735942, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 28, DATE '2026-08-17', 49845, 48404, 1441, 0, 687538, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 29, DATE '2026-09-17', 49845, 48499, 1346, 0, 639039, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 30, DATE '2026-10-17', 49845, 48594, 1251, 0, 590445, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 31, DATE '2026-11-17', 49845, 48689, 1156, 0, 541756, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 32, DATE '2026-12-17', 49845, 48784, 1061, 0, 492972, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 33, DATE '2027-01-17', 49845, 48880, 965, 0, 444092, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 34, DATE '2027-02-17', 49845, 48975, 870, 0, 395117, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 35, DATE '2027-03-17', 49845, 49071, 774, 0, 346046, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 36, DATE '2027-04-17', 49845, 49167, 678, 0, 296879, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 37, DATE '2027-05-17', 49845, 49264, 581, 0, 247615, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 38, DATE '2027-06-17', 49845, 49360, 485, 0, 198255, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 39, DATE '2027-07-17', 49845, 49457, 388, 0, 148798, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 40, DATE '2027-08-17', 49845, 49554, 291, 0, 99244, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 41, DATE '2027-09-17', 49845, 49651, 194, 0, 49593, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28'),
  ('Intraoral scanner', 42, DATE '2027-10-17', 49845, 49593, 252, 0, 0, 'EFA Customer Amortization Schedule, contract 20478295, 2024-06-28')
)
INSERT INTO financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT t.practice_id, t.loan_id, s.payment_number, s.due_date, s.payment_cents,
  s.principal_cents, s.interest_cents, s.fee_cents, s.balance_after_cents, s.source_document
FROM schedule s
JOIN target t ON t.name = s.name;

UPDATE financial_loans l
SET scheduled_payment_cents = 74357,
    payment_frequency = 'semimonthly',
    annual_interest_rate = 6,
    maturity_date = DATE '2027-10-24',
    next_payment_date = DATE '2026-08-24',
    terms_status = 'verified',
    notes = 'Management program financing. Exact Quantum Lending Solutions schedule loaded from the 2025-12-18 statement; bank withdrawals may be split and should only use a scheduled split when the amount matches.'
FROM practices p
WHERE l.practice_id = p.id
  AND p.slug = 'ssmiles'
  AND l.name = 'Fundation Group 10020573';

UPDATE financial_loans l
SET annual_interest_rate = 2.35,
    maturity_date = DATE '2027-10-17',
    next_payment_date = DATE '2026-08-17',
    terms_status = 'verified',
    notes = 'EverBank equipment financing, contract 20478295. Exact 42-month EFA amortization schedule loaded; the opening six-month period capitalized interest.'
FROM practices p
WHERE l.practice_id = p.id
  AND p.slug = 'ssmiles'
  AND l.name = 'Intraoral scanner';

COMMIT;

