-- Fix settle/unsettle_stock_adjustment to avoid pws_stock_nonneg violations.
-- Apply in Supabase SQL editor if inventory count edits fail with negative warehouse stock.

-- 1. unsettle_stock_adjustment: reverse each item's variance_qty from product_warehouse_stock
--    before items are deleted. Use the same warehouse_id logic as settle.

-- 2. settle_stock_adjustment: when applying variance to product_warehouse_stock:
--    UPDATE product_warehouse_stock
--    SET stock = stock + variance_delta
--    WHERE ...;
--    -- Reject or clamp before violating constraint:
--    IF NEW.stock < 0 THEN
--      RAISE EXCEPTION 'pws_stock_nonneg: insufficient stock for product %', product_id;
--    END IF;

-- 3. Sync products.stock with default warehouse row after settle/unsettle:
--    PERFORM recalc_product_stock();

-- Example pattern inside settle (pseudocode — adapt to your existing RPC body):
--
--   FOR item IN SELECT * FROM stock_adjustment_items WHERE adjustment_id = _adj_id LOOP
--     v_delta := item.physical_qty - item.system_qty;
--     IF v_delta = 0 THEN CONTINUE; END IF;
--     -- upsert warehouse stock row
--     UPDATE product_warehouse_stock
--       SET stock = stock + v_delta, updated_at = now()
--       WHERE product_id = item.product_id AND warehouse_id = v_wh_id
--       RETURNING stock INTO v_new_stock;
--     IF v_new_stock IS NULL OR v_new_stock < 0 THEN
--       RAISE EXCEPTION 'pws_stock_nonneg: product % would go negative', item.product_id;
--     END IF;
--   END LOOP;
--   PERFORM recalc_product_stock();
