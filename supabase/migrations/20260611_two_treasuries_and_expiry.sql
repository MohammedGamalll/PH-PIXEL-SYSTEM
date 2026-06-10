-- ============================================================================
-- Two-treasury account model + expiry-aware exchanges (2026-06-11)
--
-- This migration intentionally hard-deletes old accounts per product request.
-- It keeps exactly two accounts/treasuries per owner:
--   1) الخزنة الرئيسية (default)
--   2) الخزنة الفرعية
-- ============================================================================

ALTER TABLE public.item_exchange_items
  ADD COLUMN IF NOT EXISTS expiry_date date;

CREATE OR REPLACE FUNCTION public.ensure_two_treasury_accounts(_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_main_acc uuid;
  v_sub_acc uuid;
  v_main_treasury uuid;
  v_sub_treasury uuid;
  v_sub_number text;
BEGIN
  IF _owner IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT id INTO v_main_acc
    FROM public.accounts
   WHERE owner_id = _owner
     AND (is_default_cash = true OR name IN ('الخزنة الرئيسية','الخزينة الرئيسية'))
   ORDER BY is_default_cash DESC, created_at ASC
   LIMIT 1;

  IF v_main_acc IS NULL THEN
    INSERT INTO public.accounts(
      owner_id, created_by, name, account_number, account_type, sub_account_type,
      is_system, details, opening_balance, is_cash_equivalent, is_default_cash
    )
    SELECT _owner, _owner, 'الخزنة الرئيسية',
           CASE WHEN EXISTS (SELECT 1 FROM public.accounts WHERE owner_id = _owner AND account_number = 'CASH-001')
                THEN 'CASH-MAIN-' || substring(replace(_owner::text, '-', ''), 1, 6)
                ELSE 'CASH-001' END,
           'Asset', 'الأصول المتداولة', true, '[]'::jsonb, 0, true, true
    RETURNING id INTO v_main_acc;
  END IF;

  SELECT id INTO v_sub_acc
    FROM public.accounts
   WHERE owner_id = _owner
     AND name IN ('الخزنة الفرعية','خزنة فرعية','Sub Treasury')
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_sub_acc IS NULL THEN
    v_sub_number := CASE
      WHEN EXISTS (SELECT 1 FROM public.accounts WHERE owner_id = _owner AND account_number = 'CASH-002')
      THEN 'CASH-SUB-' || substring(replace(_owner::text, '-', ''), 1, 6)
      ELSE 'CASH-002'
    END;

    INSERT INTO public.accounts(
      owner_id, created_by, name, account_number, account_type, sub_account_type,
      is_system, details, opening_balance, is_cash_equivalent, is_default_cash
    )
    VALUES (
      _owner, _owner, 'الخزنة الفرعية', v_sub_number,
      'Asset', 'الأصول المتداولة', true, '[]'::jsonb, 0, true, false
    )
    RETURNING id INTO v_sub_acc;
  END IF;

  UPDATE public.accounts
     SET is_default_cash = false
   WHERE owner_id = _owner;

  UPDATE public.accounts
     SET name = 'الخزنة الرئيسية',
         account_type = 'Asset',
         sub_account_type = 'الأصول المتداولة',
         is_system = true,
         is_cash_equivalent = true,
         is_default_cash = true,
         is_closed = false
   WHERE id = v_main_acc;

  UPDATE public.accounts
     SET name = 'الخزنة الفرعية',
         account_type = 'Asset',
         sub_account_type = 'الأصول المتداولة',
         is_system = true,
         is_cash_equivalent = true,
         is_default_cash = false,
         is_closed = false
   WHERE id = v_sub_acc;

  SELECT id INTO v_main_treasury
    FROM public.treasuries
   WHERE owner_id = _owner AND account_id = v_main_acc
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_main_treasury IS NULL THEN
    INSERT INTO public.treasuries(owner_id, name, account_id, type)
    VALUES (_owner, 'الخزنة الرئيسية', v_main_acc, 'cash')
    RETURNING id INTO v_main_treasury;
  END IF;

  SELECT id INTO v_sub_treasury
    FROM public.treasuries
   WHERE owner_id = _owner AND account_id = v_sub_acc
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_sub_treasury IS NULL THEN
    INSERT INTO public.treasuries(owner_id, name, account_id, type)
    VALUES (_owner, 'الخزنة الفرعية', v_sub_acc, 'cash')
    RETURNING id INTO v_sub_treasury;
  END IF;

  UPDATE public.treasuries
     SET name = 'الخزنة الرئيسية', type = 'cash'
   WHERE id = v_main_treasury;

  UPDATE public.treasuries
     SET name = 'الخزنة الفرعية', type = 'cash'
   WHERE id = v_sub_treasury;

  DELETE FROM public.treasuries
   WHERE owner_id = _owner
     AND account_id IN (v_main_acc, v_sub_acc)
     AND id NOT IN (v_main_treasury, v_sub_treasury);

  RETURN jsonb_build_object(
    'main_account', v_main_acc,
    'sub_account', v_sub_acc,
    'main_treasury', v_main_treasury,
    'sub_treasury', v_sub_treasury
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_main_treasury(_owner uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  v := public.ensure_two_treasury_accounts(_owner);
  RETURN NULLIF(v->>'main_treasury', '')::uuid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_system_accounts(_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  main_acc uuid;
  sub_acc uuid;
BEGIN
  v := public.ensure_two_treasury_accounts(_owner);
  main_acc := (v->>'main_account')::uuid;
  sub_acc := (v->>'sub_account')::uuid;

  RETURN jsonb_build_object(
    'sales_revenue', sub_acc,
    'shipping_revenue', sub_acc,
    'stock_adjustment_gain', sub_acc,
    'sales_discount', sub_acc,
    'cogs', sub_acc,
    'general_expense', sub_acc,
    'damage_loss', sub_acc,
    'stock_adjustment_loss', sub_acc,
    'inventory', sub_acc,
    'accounts_receivable', sub_acc,
    'accounts_payable', sub_acc,
    'tax_payable', sub_acc,
    'undeposited_cash', main_acc,
    'opening_equity', sub_acc,
    'main_treasury', main_acc,
    'sub_treasury', sub_acc
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_treasuries_from_accounts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o uuid;
  v_count integer := 0;
BEGIN
  FOR o IN
    SELECT DISTINCT owner_id FROM public.accounts
    UNION
    SELECT DISTINCT owner_id FROM public.treasuries
  LOOP
    PERFORM public.ensure_two_treasury_accounts(o);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- Hard cleanup: keep only the two treasury accounts and their treasuries.
DO $$
DECLARE
  o uuid;
  v jsonb;
  main_acc uuid;
  sub_acc uuid;
  main_tr uuid;
  sub_tr uuid;
BEGIN
  FOR o IN
    SELECT DISTINCT owner_id FROM public.accounts
    UNION
    SELECT DISTINCT owner_id FROM public.treasuries
  LOOP
    v := public.ensure_two_treasury_accounts(o);
    main_acc := (v->>'main_account')::uuid;
    sub_acc := (v->>'sub_account')::uuid;
    main_tr := (v->>'main_treasury')::uuid;
    sub_tr := (v->>'sub_treasury')::uuid;

    UPDATE public.contact_payments
       SET treasury_account_id = main_acc
     WHERE owner_id = o
       AND treasury_account_id IS NOT NULL
       AND treasury_account_id NOT IN (main_acc, sub_acc);

    UPDATE public.invoices
       SET payment_account_id = main_acc
     WHERE owner_id = o
       AND payment_account_id IS NOT NULL
       AND payment_account_id NOT IN (main_acc, sub_acc);

    UPDATE public.purchases
       SET payment_account_id = main_acc
     WHERE owner_id = o
       AND payment_account_id IS NOT NULL
       AND payment_account_id NOT IN (main_acc, sub_acc);

    UPDATE public.expenses
       SET payment_account_id = main_acc
     WHERE owner_id = o
       AND payment_account_id IS NOT NULL
       AND payment_account_id NOT IN (main_acc, sub_acc);

    DELETE FROM public.journal_entries je
     WHERE je.owner_id = o
       AND EXISTS (
         SELECT 1
           FROM public.journal_entry_lines jel
          WHERE jel.journal_entry_id = je.id
            AND jel.account_id NOT IN (main_acc, sub_acc)
       );

    DELETE FROM public.journal_entry_lines jel
     USING public.accounts a
     WHERE jel.account_id = a.id
       AND a.owner_id = o
       AND a.id NOT IN (main_acc, sub_acc);

    DELETE FROM public.treasuries
     WHERE owner_id = o
       AND id NOT IN (main_tr, sub_tr);

    DELETE FROM public.accounts
     WHERE owner_id = o
       AND id NOT IN (main_acc, sub_acc);
  END LOOP;
END $$;
