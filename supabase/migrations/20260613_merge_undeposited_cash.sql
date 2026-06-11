-- Route all cash to the main treasury (الخزنة الرئيسية).
--
-- A stray "نقديه غير مودعه" (undeposited cash) account survived the
-- two-treasury cleanup. Because resolve_payment_account matched it by name
-- ('%نقد%'), every cash sale — and the cash reversal when converting an
-- invoice to deferred — posted there instead of the main treasury the user
-- watches on the dashboard. This merges that account into the main treasury
-- and makes resolve_payment_account prefer the default-cash account.

DO $$
DECLARE
  r record;
  v_main uuid;
  v_stray uuid;
BEGIN
  FOR r IN SELECT DISTINCT owner_id FROM public.accounts WHERE account_type = 'Asset' LOOP
    SELECT id INTO v_main
      FROM public.accounts
      WHERE owner_id = r.owner_id AND is_default_cash = true
      ORDER BY created_at ASC
      LIMIT 1;
    IF v_main IS NULL THEN CONTINUE; END IF;

    FOR v_stray IN
      SELECT id FROM public.accounts
      WHERE owner_id = r.owner_id
        AND account_type = 'Asset'
        AND id <> v_main
        AND is_default_cash = false
        AND (name LIKE '%غير مودع%' OR lower(name) LIKE '%undeposit%')
    LOOP
      UPDATE public.journal_entry_lines SET account_id = v_main WHERE account_id = v_stray;
      UPDATE public.invoices SET payment_account_id = v_main WHERE payment_account_id = v_stray;
      UPDATE public.purchases SET payment_account_id = v_main WHERE payment_account_id = v_stray;
      UPDATE public.expenses SET payment_account_id = v_main WHERE payment_account_id = v_stray;
      UPDATE public.contact_payments SET treasury_account_id = v_main WHERE treasury_account_id = v_stray;
      UPDATE public.payroll_records SET treasury_account_id = v_main WHERE treasury_account_id = v_stray;

      UPDATE public.accounts
        SET opening_balance = COALESCE(opening_balance, 0)
          + COALESCE((SELECT opening_balance FROM public.accounts WHERE id = v_stray), 0)
        WHERE id = v_main;

      -- Close + rename so it no longer matches resolve_payment_account or
      -- appears on the dashboard.
      UPDATE public.accounts
        SET is_closed = true, is_default_cash = false, name = 'حساب مدمج (مغلق)'
        WHERE id = v_stray;

      UPDATE public.account_balances SET total_debit = 0, total_credit = 0 WHERE account_id = v_stray;
    END LOOP;
  END LOOP;

  -- Recompute balances from the (now repointed) ledger.
  UPDATE public.account_balances ab
    SET total_debit = COALESCE(s.d, 0), total_credit = COALESCE(s.c, 0)
    FROM (
      SELECT account_id, SUM(debit) AS d, SUM(credit) AS c
      FROM public.journal_entry_lines
      GROUP BY account_id
    ) s
    WHERE ab.account_id = s.account_id;
END $$;

-- Prefer the default-cash (main) treasury when resolving a cash payment account.
CREATE OR REPLACE FUNCTION public.resolve_payment_account(_owner uuid, _text text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  t text;
BEGIN
  IF _text IS NULL OR length(trim(_text)) = 0 THEN RETURN NULL; END IF;
  BEGIN
    v_id := _text::uuid;
    PERFORM 1 FROM public.accounts WHERE id = v_id AND owner_id = _owner;
    IF FOUND THEN RETURN v_id; END IF;
  EXCEPTION WHEN others THEN
  END;
  t := lower(trim(_text));
  SELECT id INTO v_id FROM public.accounts
    WHERE owner_id = _owner
      AND COALESCE(is_closed, false) = false
      AND (
        (t IN ('cash','نقدي','نقدية','نقد') AND (lower(name) LIKE '%cash%' OR name LIKE '%نقد%' OR is_default_cash))
        OR (t IN ('bank','بنك','تحويل','transfer') AND (lower(name) LIKE '%bank%' OR name LIKE '%بنك%'))
        OR lower(name) = t
      )
    ORDER BY is_default_cash DESC, is_system DESC, created_at ASC
    LIMIT 1;
  RETURN v_id;
END;
$function$;
