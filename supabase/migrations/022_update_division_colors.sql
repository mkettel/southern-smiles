-- ============================================================
-- Migration 022: Standardize division colors
-- Sets the canonical color for each of the 7 Hubbard divisions.
-- Safe: only updates existing rows; no-op for divisions not present.
-- ============================================================

UPDATE divisions SET color = '#14719c' WHERE number = 1;
UPDATE divisions SET color = '#c44c11' WHERE number = 2;
UPDATE divisions SET color = '#1e5346' WHERE number = 3;
UPDATE divisions SET color = '#193a6a' WHERE number = 4;
UPDATE divisions SET color = '#d5901b' WHERE number = 5;
UPDATE divisions SET color = '#b31e31' WHERE number = 6;
