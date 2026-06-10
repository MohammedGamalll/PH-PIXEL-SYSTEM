-- ============================================================================
-- Inventory consistency + treasury fixes (2026-06-10)
--
-- Goals:
--  1. Persist base_quantity on standalone_return_items so the selected unit
--     (box/strip/pill) is honoured everywhere, not just at return time.
--  2. Add item-exchange tables so exchanges are real, durable inventory
--     movements (not just a direct products.stock poke that recalc wipes).
--  3. Make recalc_product_stock comprehensive so "Current Inventory" reflects
--     EVERY movement type (purchases, sales, normal returns, standalone
--     returns, branch transfers, damages, item exchanges) and therefore stays
--     in sync with the computed expiry batches.
--  4. Guarantee every owner has a single Main Treasury (الخزنة الرئيسية) cash
--     account + linked treasury, de-duplicating any stray treasury rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) standalone_return_items.base_quantity
-- ----------------------------------------------------------------------------
ALTER TABLE public.standalone_return_items
  ADD COLUMN IF NOT EXISTS base_quantity numeric;

UPDATE public.standalone_return_items
   SET base_quantity = quantity
 WHERE base_quantity IS NULL;

-- ----------------------------------------------------------------------------
-- 2) Item exchange tables (durable movement records)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  reference text,
  contact_id uuid,
  contact_type text,
  treasury_id uuid,
  exchange_date date DEFAULT CURRENT_DATE,
  notes text,
  net_cash numeric DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.item_exchange_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id uuid NOT NULL REFERENCES public.item_exchanges(id) ON DELETE CASCADE,
  product_id uuid,
  product_name_snapshot text,
  direction text NOT NULL,          -- 'incoming' (stock +) | 'outgoing' (stock -)
  quantity numeric DEFAULT 0,
  base_quantity numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_exchanges_owner ON public.item_exchanges(owner_id);
CREATE INDEX IF NOT EXISTS idx_item_exchange_items_exchange ON public.item_exchange_items(exchange_id);
CREATE INDEX IF NOT EXISTS idx_item_exchange_items_product ON public.item_exchange_items(product_id);

ALTER TABLE public.item_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_exchange_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_exchanges_rw ON public.item_exchanges;
CREATE POLICY item_exchanges_rw ON public.item_exchanges
  FOR ALL
  USING (owner_id = public.get_auth_admin_id())
  WITH CHECK (owner_id = public.get_auth_admin_id());

DROP POLICY IF EXISTS item_exchange_items_rw ON public.item_exchange_items;
CREATE POLICY item_exchange_items_rw ON public.item_exchange_items
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.item_exchanges e WHERE e.id = exchange_id AND e.owner_id = public.get_auth_admin_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.item_exchanges e WHERE e.id = exchange_id AND e.owner_id = public.get_auth_admin_id()));

-- ----------------------------------------------------------------------------
-- 3) process_standalone_return — persist base_quantity on each line
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_standalone_return(_return_type text, _warehouse_id uuid, _treasury_id uuid, _reason text, _items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_user uuid := auth.uid();
  v_user_name text;
  v_header uuid;
  v_ref text;
  v_item jsonb;
  v_pid uuid;
  v_pname text;
  v_qty numeric;
  v_base_qty numeric;
  v_price numeric;
  v_line_total numeric;
  v_total numeric := 0;
  v_tx_id uuid;
  v_tx_type text;
  v_summary text := '';
  v_count int;
  v_current_stock numeric;
  v_expiry date;
BEGIN
  IF _return_type NOT IN ('sales','purchase') THEN
    RAISE EXCEPTION 'INVALID_RETURN_TYPE';
  END IF;
  IF _treasury_id IS NULL THEN
    RAISE EXCEPTION 'TREASURY_REQUIRED';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'ITEMS_REQUIRED';
  END IF;

  SELECT owner_id INTO v_owner FROM public.treasuries WHERE id = _treasury_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'TREASURY_NOT_FOUND';
  END IF;

  IF _warehouse_id IS NULL THEN
    SELECT id INTO _warehouse_id FROM public.warehouses
      WHERE owner_id = v_owner AND is_active = true
      ORDER BY is_default DESC, created_at ASC LIMIT 1;
  END IF;

  SELECT COALESCE(name, email) INTO v_user_name FROM public.employees WHERE id = v_user;

  v_ref := CASE WHEN _return_type = 'sales' THEN 'SR' ELSE 'PR' END
           || '-' || to_char(now(), 'YYYYMMDD') || '-'
           || lpad(((floor(random()*9999))::int)::text, 4, '0');

  INSERT INTO public.standalone_returns(
    owner_id, return_type, return_date, warehouse_id, treasury_id,
    total_amount, reason, reference_no, created_by, created_by_name_snapshot
  ) VALUES (
    v_owner, _return_type, CURRENT_DATE, _warehouse_id, _treasury_id,
    0, _reason, v_ref, v_user, v_user_name
  ) RETURNING id INTO v_header;

  v_count := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_base_qty := COALESCE((v_item->>'base_quantity')::numeric, v_qty);
    v_pid := NULLIF(v_item->>'product_id','')::uuid;
    v_pname := NULLIF(v_item->>'new_product_name','');
    v_expiry := NULLIF(v_item->>'expiry_date','')::date;

    IF v_qty <= 0 OR v_price < 0 THEN CONTINUE; END IF;
    IF v_pid IS NULL AND v_pname IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_OR_NAME_REQUIRED';
    END IF;

    IF v_pid IS NOT NULL THEN
      SELECT name, COALESCE(stock,0) INTO v_pname, v_current_stock
        FROM public.products WHERE id = v_pid AND owner_id = v_owner;
      IF v_pname IS NULL THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
      END IF;
      IF _return_type = 'purchase' AND v_current_stock < v_base_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_pname;
      END IF;
    END IF;

    v_line_total := v_qty * v_price;
    v_total := v_total + v_line_total;
    v_count := v_count + 1;
    IF v_count = 1 THEN
      v_summary := v_pname;
    ELSIF v_count <= 3 THEN
      v_summary := v_summary || ', ' || v_pname;
    END IF;

    INSERT INTO public.standalone_return_items(
      standalone_return_id, product_id, product_name_snapshot, quantity, base_quantity, unit_price, total, expiry_date
    ) VALUES (v_header, v_pid, v_pname, v_qty, v_base_qty, v_price, v_line_total, v_expiry);

    IF v_pid IS NOT NULL THEN
      IF _warehouse_id IS NOT NULL THEN
        INSERT INTO public.product_warehouse_stock(owner_id, product_id, warehouse_id, stock)
        VALUES (v_owner, v_pid, _warehouse_id,
                CASE WHEN _return_type = 'sales' THEN v_base_qty ELSE 0 END)
        ON CONFLICT (product_id, warehouse_id) DO UPDATE
        SET stock = CASE
              WHEN _return_type = 'sales' THEN public.product_warehouse_stock.stock + v_base_qty
              ELSE GREATEST(0, public.product_warehouse_stock.stock - v_base_qty)
            END,
            updated_at = now();
      END IF;

      UPDATE public.products
         SET stock = CASE
               WHEN _return_type = 'sales' THEN stock + v_base_qty
               ELSE GREATEST(0, stock - v_base_qty)
             END,
             updated_at = now()
       WHERE id = v_pid;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'NO_VALID_ITEMS';
  END IF;

  v_tx_type := CASE WHEN _return_type = 'sales' THEN 'withdraw' ELSE 'deposit' END;

  INSERT INTO public.treasury_transactions(
    owner_id, treasury_id, type, amount, description, reference, transaction_date
  ) VALUES (
    v_owner, _treasury_id, v_tx_type, v_total,
    'Standalone ' || CASE WHEN _return_type='sales' THEN 'Sales' ELSE 'Purchase' END
      || ' Return - ' || v_summary
      || COALESCE(' - ' || NULLIF(_reason,''), ''),
    NULL, CURRENT_DATE
  ) RETURNING id INTO v_tx_id;

  UPDATE public.standalone_returns
     SET total_amount = v_total, treasury_transaction_id = v_tx_id, updated_at = now()
   WHERE id = v_header;

  RETURN jsonb_build_object(
    'id', v_header,
    'reference_no', v_ref,
    'treasury_transaction_id', v_tx_id,
    'total_amount', v_total
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4) recalc_product_stock — comprehensive, matches computeProductBatches
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_product_stock()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid := public.get_auth_admin_id();
  v_count integer := 0;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH
  pur AS (
    SELECT pi.product_id, COALESCE(SUM(pi.base_quantity),0) AS q
    FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.owner_id = v_owner AND pi.product_id IS NOT NULL
    GROUP BY pi.product_id
  ),
  sal AS (
    SELECT ii.product_id,
      COALESCE(SUM(CASE WHEN i.type='sale' THEN ABS(ii.base_quantity) ELSE 0 END),0) AS sold,
      COALESCE(SUM(CASE WHEN i.type='sale_return' THEN ABS(ii.base_quantity) ELSE 0 END),0) AS ret
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.owner_id = v_owner AND i.status NOT IN ('draft','cancelled')
      AND ii.product_id IS NOT NULL
    GROUP BY ii.product_id
  ),
  pre AS (
    SELECT pri.product_id, COALESCE(SUM(pri.base_quantity),0) AS q
    FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
    WHERE pr.owner_id = v_owner AND pri.product_id IS NOT NULL
    GROUP BY pri.product_id
  ),
  dmg AS (
    SELECT dsi.product_id, COALESCE(SUM(dsi.base_quantity),0) AS q
    FROM damaged_stock_items dsi JOIN damaged_stock d ON d.id = dsi.damaged_stock_id
    WHERE d.owner_id = v_owner AND dsi.product_id IS NOT NULL
    GROUP BY dsi.product_id
  ),
  bt_in AS (
    SELECT bti.target_product_id AS product_id, COALESCE(SUM(bti.base_quantity),0) AS q
    FROM inventory_branch_transfer_items bti
    WHERE bti.target_product_id IS NOT NULL
    GROUP BY bti.target_product_id
  ),
  bt_out AS (
    SELECT bti.source_product_id AS product_id, COALESCE(SUM(bti.base_quantity),0) AS q
    FROM inventory_branch_transfer_items bti
    WHERE bti.source_product_id IS NOT NULL
    GROUP BY bti.source_product_id
  ),
  sr AS (
    SELECT sri.product_id,
      COALESCE(SUM(CASE WHEN s.return_type='sales' THEN COALESCE(sri.base_quantity, sri.quantity) ELSE 0 END),0) AS add_q,
      COALESCE(SUM(CASE WHEN s.return_type='purchase' THEN COALESCE(sri.base_quantity, sri.quantity) ELSE 0 END),0) AS sub_q
    FROM standalone_return_items sri JOIN standalone_returns s ON s.id = sri.standalone_return_id
    WHERE s.owner_id = v_owner AND sri.product_id IS NOT NULL
    GROUP BY sri.product_id
  ),
  exc AS (
    SELECT ei.product_id,
      COALESCE(SUM(CASE WHEN ei.direction='incoming' THEN COALESCE(ei.base_quantity,0) ELSE 0 END),0) AS add_q,
      COALESCE(SUM(CASE WHEN ei.direction='outgoing' THEN COALESCE(ei.base_quantity,0) ELSE 0 END),0) AS sub_q
    FROM item_exchange_items ei JOIN item_exchanges e ON e.id = ei.exchange_id
    WHERE e.owner_id = v_owner AND ei.product_id IS NOT NULL
    GROUP BY ei.product_id
  ),
  computed AS (
    SELECT pr.id,
      GREATEST(
        COALESCE(pur.q,0) + COALESCE(bt_in.q,0) + COALESCE(sr.add_q,0) + COALESCE(exc.add_q,0)
          - COALESCE(sal.sold,0) + COALESCE(sal.ret,0)
          - COALESCE(pre.q,0) - COALESCE(dmg.q,0) - COALESCE(bt_out.q,0)
          - COALESCE(sr.sub_q,0) - COALESCE(exc.sub_q,0),
        0
      ) AS new_stock
    FROM products pr
    LEFT JOIN pur ON pur.product_id = pr.id
    LEFT JOIN sal ON sal.product_id = pr.id
    LEFT JOIN pre ON pre.product_id = pr.id
    LEFT JOIN dmg ON dmg.product_id = pr.id
    LEFT JOIN bt_in ON bt_in.product_id = pr.id
    LEFT JOIN bt_out ON bt_out.product_id = pr.id
    LEFT JOIN sr ON sr.product_id = pr.id
    LEFT JOIN exc ON exc.product_id = pr.id
    WHERE pr.owner_id = v_owner
  ),
  updated AS (
    UPDATE products pr SET stock = c.new_stock, updated_at = now()
    FROM computed c
    WHERE pr.id = c.id AND pr.owner_id = v_owner AND pr.stock IS DISTINCT FROM c.new_stock
    RETURNING pr.id
  )
  SELECT count(*) INTO v_count FROM updated;

  -- Warehouse-level stock (best-effort; warehouse-aware movements only).
  WITH
  pur AS (
    SELECT pi.product_id, p.warehouse_id, COALESCE(SUM(pi.base_quantity),0) AS q
    FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.owner_id = v_owner AND p.warehouse_id IS NOT NULL AND pi.product_id IS NOT NULL
    GROUP BY pi.product_id, p.warehouse_id
  ),
  sal AS (
    SELECT ii.product_id, i.warehouse_id,
      COALESCE(SUM(CASE WHEN i.type='sale' THEN ABS(ii.base_quantity) ELSE 0 END),0) AS sold,
      COALESCE(SUM(CASE WHEN i.type='sale_return' THEN ABS(ii.base_quantity) ELSE 0 END),0) AS ret
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.owner_id = v_owner AND i.warehouse_id IS NOT NULL
      AND ii.product_id IS NOT NULL
      AND i.status NOT IN ('draft','cancelled')
    GROUP BY ii.product_id, i.warehouse_id
  ),
  dmg AS (
    SELECT dsi.product_id, d.warehouse_id, COALESCE(SUM(dsi.base_quantity),0) AS q
    FROM damaged_stock_items dsi JOIN damaged_stock d ON d.id = dsi.damaged_stock_id
    WHERE d.owner_id = v_owner AND d.warehouse_id IS NOT NULL AND dsi.product_id IS NOT NULL
    GROUP BY dsi.product_id, d.warehouse_id
  ),
  sr AS (
    SELECT sri.product_id, s.warehouse_id,
      COALESCE(SUM(CASE WHEN s.return_type='sales' THEN COALESCE(sri.base_quantity, sri.quantity) ELSE 0 END),0) AS add_q,
      COALESCE(SUM(CASE WHEN s.return_type='purchase' THEN COALESCE(sri.base_quantity, sri.quantity) ELSE 0 END),0) AS sub_q
    FROM standalone_return_items sri JOIN standalone_returns s ON s.id = sri.standalone_return_id
    WHERE s.owner_id = v_owner AND s.warehouse_id IS NOT NULL AND sri.product_id IS NOT NULL
    GROUP BY sri.product_id, s.warehouse_id
  ),
  combined AS (
    SELECT product_id, warehouse_id, q AS s FROM pur
    UNION ALL SELECT product_id, warehouse_id, -sold FROM sal
    UNION ALL SELECT product_id, warehouse_id, ret FROM sal
    UNION ALL SELECT product_id, warehouse_id, -q FROM dmg
    UNION ALL SELECT product_id, warehouse_id, add_q FROM sr
    UNION ALL SELECT product_id, warehouse_id, -sub_q FROM sr
  ),
  agg AS (
    SELECT product_id, warehouse_id, GREATEST(SUM(s), 0) AS new_stock
    FROM combined
    WHERE product_id IS NOT NULL AND warehouse_id IS NOT NULL
    GROUP BY product_id, warehouse_id
  )
  INSERT INTO public.product_warehouse_stock (owner_id, product_id, warehouse_id, stock, updated_at)
  SELECT v_owner, agg.product_id, agg.warehouse_id, agg.new_stock, now()
  FROM agg
  ON CONFLICT (owner_id, product_id, warehouse_id) DO UPDATE
    SET stock = EXCLUDED.stock, updated_at = now();

  RETURN v_count;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5) ensure_system_accounts — also guarantee a Main Treasury per owner
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_main_treasury(_owner uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acc uuid;
  v_treasury uuid;
BEGIN
  IF _owner IS NULL THEN RETURN NULL; END IF;

  -- Find (or promote) the main cash account.
  SELECT id INTO v_acc FROM public.accounts
   WHERE owner_id = _owner AND is_default_cash = true
   ORDER BY created_at ASC LIMIT 1;

  IF v_acc IS NULL THEN
    SELECT id INTO v_acc FROM public.accounts
     WHERE owner_id = _owner AND name IN ('الخزنة الرئيسية','الخزينة الرئيسية')
     ORDER BY created_at ASC LIMIT 1;
    IF v_acc IS NOT NULL THEN
      UPDATE public.accounts
         SET is_default_cash = true, is_cash_equivalent = true
       WHERE id = v_acc;
    END IF;
  END IF;

  IF v_acc IS NULL THEN
    INSERT INTO public.accounts(
      owner_id, created_by, name, account_number, account_type, sub_account_type,
      is_system, details, opening_balance, is_cash_equivalent, is_default_cash
    )
    SELECT _owner, _owner, 'الخزنة الرئيسية',
           CASE WHEN EXISTS (SELECT 1 FROM public.accounts WHERE owner_id=_owner AND account_number='CASH-001')
                THEN 'CASH-' || substring(replace(_owner::text,'-',''),1,6)
                ELSE 'CASH-001' END,
           'Asset', 'الأصول المتداولة', true, '[]'::jsonb, 0, true, true
    RETURNING id INTO v_acc;
  END IF;

  -- Ensure a single linked treasury; de-duplicate any extras pointing to it.
  SELECT id INTO v_treasury FROM public.treasuries
   WHERE owner_id = _owner AND account_id = v_acc
   ORDER BY created_at ASC LIMIT 1;

  IF v_treasury IS NULL THEN
    INSERT INTO public.treasuries(owner_id, name, account_id, type)
    VALUES (_owner, 'الخزنة الرئيسية', v_acc, 'cash')
    RETURNING id INTO v_treasury;
  END IF;

  -- Remove duplicate treasuries linked to the same main account.
  DELETE FROM public.treasuries
   WHERE owner_id = _owner AND account_id = v_acc AND id <> v_treasury;

  RETURN v_treasury;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_system_accounts(_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  defs jsonb := jsonb_build_array(
    jsonb_build_object('key','sales_revenue','num','4000','name','إيرادات المبيعات','type','Revenue','sub','إيرادات تشغيلية','cash',false),
    jsonb_build_object('key','shipping_revenue','num','4100','name','إيرادات شحن','type','Revenue','sub','إيرادات تشغيلية','cash',false),
    jsonb_build_object('key','stock_adjustment_gain','num','4200','name','مكاسب عمليات الجرد','type','Revenue','sub','إيرادات أخرى','cash',false),
    jsonb_build_object('key','sales_discount','num','4900','name','خصومات مبيعات','type','Expense','sub','خصومات وتخفيضات','cash',false),
    jsonb_build_object('key','cogs','num','5000','name','تكلفة البضاعة المباعة','type','Expense','sub','تكلفة المبيعات','cash',false),
    jsonb_build_object('key','general_expense','num','5900','name','مصروفات عامة','type','Expense','sub','مصروفات تشغيلية','cash',false),
    jsonb_build_object('key','damage_loss','num','5800','name','خسائر التوالف','type','Expense','sub','مصروفات تشغيلية','cash',false),
    jsonb_build_object('key','stock_adjustment_loss','num','5810','name','خسائر عمليات الجرد','type','Expense','sub','مصروفات تشغيلية','cash',false),
    jsonb_build_object('key','inventory','num','1200','name','المخزون','type','Asset','sub','الأصول المتداولة','cash',false),
    jsonb_build_object('key','accounts_receivable','num','1300','name','عملاء - ذمم مدينة','type','Asset','sub','الأصول المتداولة','cash',false),
    jsonb_build_object('key','accounts_payable','num','2000','name','موردين - ذمم دائنة','type','Liability','sub','الالتزامات المتداولة','cash',false),
    jsonb_build_object('key','tax_payable','num','2100','name','ضرائب مستحقة','type','Liability','sub','الالتزامات المتداولة','cash',false),
    jsonb_build_object('key','undeposited_cash','num','1100','name','نقدية غير مودعة','type','Asset','sub','الأصول المتداولة','cash',true),
    jsonb_build_object('key','opening_equity','num','3000','name','أرصدة افتتاحية','type','Equity','sub','حقوق الملكية','cash',false)
  );
  d jsonb; v_id uuid;
BEGIN
  FOR d IN SELECT * FROM jsonb_array_elements(defs) LOOP
    SELECT id INTO v_id FROM public.accounts WHERE owner_id=_owner AND is_system=true AND account_number=(d->>'num');
    IF v_id IS NULL THEN
      INSERT INTO public.accounts(owner_id, created_by, name, account_number, account_type, sub_account_type, is_system, details, opening_balance, is_cash_equivalent)
      VALUES (_owner,_owner,d->>'name',d->>'num',d->>'type',d->>'sub',true,'[]'::jsonb,0,(d->>'cash')::boolean) RETURNING id INTO v_id;
    END IF;
    v := v || jsonb_build_object(d->>'key', v_id);
  END LOOP;

  -- Guarantee a Main Treasury (الخزنة الرئيسية) cash account + linked treasury.
  PERFORM public.ensure_main_treasury(_owner);

  RETURN v;
END; $function$;

-- ----------------------------------------------------------------------------
-- 6) Backfill: every existing owner gets a Main Treasury, dedup, recalc
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  o uuid;
BEGIN
  FOR o IN SELECT DISTINCT owner_id FROM public.accounts LOOP
    PERFORM public.ensure_main_treasury(o);
  END LOOP;
END $$;
