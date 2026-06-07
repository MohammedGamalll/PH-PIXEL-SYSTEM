-- Link standalone returns to cashier sessions via treasury movements.
-- Applied on Supabase project idtygsydzixnswntbign.

ALTER TABLE treasury_transactions
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES cashier_sessions(id);

CREATE INDEX IF NOT EXISTS idx_treasury_transactions_session_id
  ON treasury_transactions(session_id) WHERE session_id IS NOT NULL;

-- Backfill existing standalone returns: match treasury tx to the cashier session
-- that was open when the return was created (same owner).
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

-- New returns from cashier: createStandaloneReturn sets treasury_transactions.session_id
-- after process_standalone_return RPC (see standalone-returns.functions.ts).
