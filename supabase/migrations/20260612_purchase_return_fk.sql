-- Add the missing foreign keys on purchase_return_items so PostgREST can embed
-- purchase_returns / products, and so the item card can reliably reflect
-- purchase returns. Existing data is clean (no null product_id), so this is safe.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'purchase_return_items'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'purchase_return_items_purchase_return_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_return_items
      ADD CONSTRAINT purchase_return_items_purchase_return_id_fkey
      FOREIGN KEY (purchase_return_id)
      REFERENCES public.purchase_returns(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'purchase_return_items'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'purchase_return_items_product_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_return_items
      ADD CONSTRAINT purchase_return_items_product_id_fkey
      FOREIGN KEY (product_id)
      REFERENCES public.products(id);
  END IF;
END $$;
