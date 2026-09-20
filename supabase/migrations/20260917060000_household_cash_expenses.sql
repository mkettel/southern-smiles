-- Cash spending is separate from bank feeds and does not assert a cash balance.
CREATE TABLE public.household_cash_expenses (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  expense_date date NOT NULL,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 300),
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 9999999999),
  bookkeeping_account_id uuid NOT NULL REFERENCES public.bookkeeping_accounts(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  voided boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX household_cash_practice_date ON public.household_cash_expenses(practice_id, expense_date, id);
CREATE TABLE public.household_cash_history (
  expense_id uuid NOT NULL REFERENCES public.household_cash_expenses(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  version integer NOT NULL,
  expense_date date NOT NULL,
  description text NOT NULL,
  amount_cents bigint NOT NULL,
  bookkeeping_account_id uuid NOT NULL REFERENCES public.bookkeeping_accounts(id),
  category_name text NOT NULL,
  voided boolean NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (expense_id, version)
);
CREATE INDEX household_cash_history_practice ON public.household_cash_history(practice_id, changed_at);
ALTER TABLE public.household_cash_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_cash_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.household_cash_expenses, public.household_cash_history FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.household_cash_expenses TO service_role;
GRANT SELECT, INSERT ON public.household_cash_history TO service_role;

CREATE FUNCTION public.audit_household_cash_expense() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE category_label text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.practice_id <> OLD.practice_id OR NEW.id <> OLD.id) THEN
    RAISE EXCEPTION 'Expense ownership cannot change';
  END IF;
  SELECT name INTO category_label FROM public.bookkeeping_accounts
    WHERE id = NEW.bookkeeping_account_id AND practice_id = NEW.practice_id
      AND account_type ILIKE '%expense%';
  IF category_label IS NULL THEN RAISE EXCEPTION 'Invalid expense category'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.updated_by AND practice_id = NEW.practice_id AND is_active) THEN
    RAISE EXCEPTION 'Invalid expense author';
  END IF;
  NEW.version := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE OLD.version + 1 END;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE FUNCTION public.record_household_cash_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.household_cash_history
    (expense_id, practice_id, version, expense_date, description, amount_cents,
     bookkeeping_account_id, category_name, voided, changed_by)
  SELECT NEW.id, NEW.practice_id, NEW.version, NEW.expense_date, NEW.description,
    NEW.amount_cents, NEW.bookkeeping_account_id, name, NEW.voided, NEW.updated_by
    FROM public.bookkeeping_accounts WHERE id = NEW.bookkeeping_account_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_household_cash_expense(), public.record_household_cash_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_household_cash_expense(), public.record_household_cash_history() TO service_role;
CREATE TRIGGER household_cash_validate BEFORE INSERT OR UPDATE ON public.household_cash_expenses
  FOR EACH ROW EXECUTE FUNCTION public.audit_household_cash_expense();
CREATE TRIGGER household_cash_audit AFTER INSERT OR UPDATE ON public.household_cash_expenses
  FOR EACH ROW EXECUTE FUNCTION public.record_household_cash_history();
