BEGIN;

-- Explicit opt-in, scoped to a loan and funding account. No production rules
-- are enabled by deploying this migration.
CREATE TABLE public.financial_loan_auto_rules (
  loan_id uuid PRIMARY KEY REFERENCES public.financial_loans(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id),
  interest_account_id uuid NOT NULL REFERENCES public.bookkeeping_accounts(id),
  starts_on date NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE public.financial_loan_auto_postings (
  schedule_entry_id uuid PRIMARY KEY REFERENCES public.financial_loan_schedule_entries(id),
  financial_transaction_id uuid NOT NULL UNIQUE REFERENCES public.financial_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_loan_auto_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_loan_auto_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_loan_auto_rules, public.financial_loan_auto_postings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_loan_auto_rules, public.financial_loan_auto_postings TO service_role;

CREATE FUNCTION public.auto_post_scheduled_loan_payment(p_practice_id uuid, p_transaction_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  imported public.financial_transactions%ROWTYPE;
  candidate record;
  match_count integer;
BEGIN
  SELECT * INTO imported FROM public.financial_transactions
  WHERE id = p_transaction_id AND practice_id = p_practice_id FOR UPDATE;
  IF NOT FOUND OR imported.pending OR imported.is_removed
    OR imported.review_status <> 'pending' OR imported.amount_cents <= 0
    OR imported.account_id IS NULL THEN RETURN false; END IF;
  -- This first version supports only the established EverBank ACH format.
  IF coalesce(imported.original_description, imported.name, '') !~*
    '^BUSINESS TO BUSINESS ACH EverBank, N[.]A[.] EverBank [0-9]{6} AC-BUND[0-9]+ ' THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_transaction_links
    WHERE financial_transaction_id = imported.id) THEN RETURN false; END IF;

  -- Serialize matching payments for every eligible loan before choosing a row.
  PERFORM loan.id FROM public.financial_loans loan
  JOIN public.financial_loan_auto_rules rule ON rule.loan_id = loan.id
  WHERE loan.practice_id = p_practice_id AND rule.practice_id = p_practice_id
    AND rule.financial_account_id = imported.account_id AND rule.is_enabled
  ORDER BY loan.id FOR UPDATE OF loan FOR SHARE OF rule;

  SELECT count(*) INTO match_count
  FROM public.financial_loan_auto_rules rule
  JOIN public.financial_loans loan ON loan.id = rule.loan_id AND loan.practice_id = rule.practice_id
  JOIN public.financial_loan_schedule_entries schedule ON schedule.loan_id = loan.id AND schedule.practice_id = loan.practice_id
  JOIN public.financial_accounts bank ON bank.id = rule.financial_account_id AND bank.practice_id = loan.practice_id
  JOIN public.bookkeeping_accounts expense ON expense.id = rule.interest_account_id AND expense.practice_id = loan.practice_id
  WHERE rule.practice_id = p_practice_id AND rule.is_enabled
    AND rule.financial_account_id = imported.account_id AND imported.transaction_date >= rule.starts_on
    AND lower(loan.lender_name) = 'everbank' AND loan.status = 'active' AND loan.terms_status = 'verified'
    AND loan.payment_frequency = 'monthly' AND loan.interest_method = 'amortizing'
    AND expense.is_active AND expense.account_type ILIKE '%expense%'
    AND schedule.payment_cents = imported.amount_cents
    AND loan.scheduled_payment_cents = imported.amount_cents
    AND schedule.principal_cents > 0 AND schedule.interest_cents >= 0 AND schedule.fee_cents = 0
    AND schedule.principal_cents + schedule.interest_cents = schedule.payment_cents
    AND schedule.principal_cents <= loan.current_balance_cents
    AND schedule.due_date > loan.balance_anchor_date
    AND abs(schedule.due_date - imported.transaction_date) <= 7
    AND nullif(trim(schedule.source_document), '') IS NOT NULL;
  IF match_count <> 1 THEN RETURN false; END IF;

  SELECT schedule.*, rule.interest_account_id INTO candidate
  FROM public.financial_loan_auto_rules rule
  JOIN public.financial_loans loan ON loan.id = rule.loan_id
  JOIN public.financial_loan_schedule_entries schedule ON schedule.loan_id = loan.id
  JOIN public.financial_accounts bank ON bank.id = rule.financial_account_id AND bank.practice_id = loan.practice_id
  JOIN public.bookkeeping_accounts expense ON expense.id = rule.interest_account_id AND expense.practice_id = loan.practice_id
  WHERE rule.practice_id = p_practice_id AND loan.practice_id = p_practice_id
    AND schedule.practice_id = p_practice_id AND rule.is_enabled
    AND rule.financial_account_id = imported.account_id AND imported.transaction_date >= rule.starts_on
    AND lower(loan.lender_name) = 'everbank' AND loan.status = 'active' AND loan.terms_status = 'verified'
    AND loan.payment_frequency = 'monthly' AND loan.interest_method = 'amortizing'
    AND expense.is_active AND expense.account_type ILIKE '%expense%'
    AND schedule.payment_cents = imported.amount_cents AND loan.scheduled_payment_cents = imported.amount_cents
    AND schedule.principal_cents > 0 AND schedule.interest_cents >= 0 AND schedule.fee_cents = 0
    AND schedule.principal_cents + schedule.interest_cents = schedule.payment_cents
    AND schedule.principal_cents <= loan.current_balance_cents AND schedule.due_date > loan.balance_anchor_date
    AND abs(schedule.due_date - imported.transaction_date) <= 7
    AND nullif(trim(schedule.source_document), '') IS NOT NULL
  FOR UPDATE OF schedule;
  IF EXISTS (SELECT 1 FROM public.financial_loan_auto_postings WHERE schedule_entry_id = candidate.id)
    OR EXISTS (SELECT 1 FROM public.financial_loan_payments payment
      WHERE payment.loan_id = candidate.loan_id AND payment.activity_kind = 'payment'
        AND (abs(payment.payment_date - candidate.due_date) <= 7
          OR date_trunc('month', payment.payment_date) = date_trunc('month', candidate.due_date))) THEN
    RETURN false;
  END IF;

  PERFORM public.post_financial_loan_allocations(p_practice_id, imported.id, 'payment',
    jsonb_build_array(jsonb_build_object('loan_id', candidate.loan_id,
      'principal_cents', candidate.principal_cents, 'interest_cents', candidate.interest_cents, 'fee_cents', 0)),
    candidate.interest_account_id, NULL,
    'Auto-approved from verified schedule installment ' || candidate.payment_number || ' due ' || candidate.due_date,
    NULL);
  INSERT INTO public.financial_loan_auto_postings(schedule_entry_id, financial_transaction_id)
  VALUES (candidate.id, imported.id);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_post_scheduled_loan_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_post_scheduled_loan_payment(uuid, uuid) TO service_role;
COMMIT;
