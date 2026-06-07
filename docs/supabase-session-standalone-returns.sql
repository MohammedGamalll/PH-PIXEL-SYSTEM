-- Link standalone returns to cashier sessions via treasury movements.
-- Run in Supabase SQL editor or via lib/db/scripts/run-session-standalone-returns-migration.mjs

ALTER TABLE treasury_transactions
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES cashier_sessions(id);

CREATE INDEX IF NOT EXISTS idx_treasury_transactions_session_id
  ON treasury_transactions(session_id) WHERE session_id IS NOT NULL;

-- Metadata for cash vs account and session UI (Expected Cash uses payment_method)
ALTER TABLE standalone_returns
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS contact_id uuid,
  ADD COLUMN IF NOT EXISTS contact_type text;

-- Backfill existing standalone returns: match treasury tx to open cashier session at return time
UPDATE treasury_transactions tt
SET session_id = pick.session_id
FROM (
  SELECT DISTINCT ON (sr.id)
    tt2.id AS treasury_tx_id,
    cs.id AS session_id
  FROM standalone_returns sr
  JOIN treasury_transactions tt2 ON tt2.id = sr.treasury_transaction_id
  JOIN cashier_sessions cs
    ON cs.owner_id = sr.owner_id
   AND sr.created_at >= cs.opened_at
   AND (cs.closed_at IS NULL OR sr.created_at <= cs.closed_at)
  WHERE tt2.session_id IS NULL
    AND sr.treasury_transaction_id IS NOT NULL
  ORDER BY sr.id, cs.opened_at DESC
) pick
WHERE tt.id = pick.treasury_tx_id
  AND tt.session_id IS NULL;

-- Backfill payment_method: account if matching contact_payment with standalone note exists
UPDATE standalone_returns sr
SET payment_method = 'account'
WHERE sr.payment_method IS NULL
  AND EXISTS (
    SELECT 1 FROM contact_payments cp
    WHERE cp.ref_no = sr.reference_no
      AND cp.notes LIKE '%مرتجع حر%'
  );

UPDATE standalone_returns sr
SET payment_method = 'cash'
WHERE sr.payment_method IS NULL;

-- Optional RPC extension: add _session_id uuid DEFAULT NULL to process_standalone_return
-- and inside the function after creating treasury_transaction:
--   IF _session_id IS NOT NULL THEN
--     UPDATE treasury_transactions SET session_id = _session_id WHERE id = v_treasury_tx_id;
--   END IF;
-- Client-side createStandaloneReturn also sets session_id when RPC is not yet extended.
