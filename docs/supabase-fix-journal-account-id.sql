-- Fix journal_entry_lines_account_id_fkey violations
-- Run in Supabase SQL editor after deploying client-side treasury-account.ts fixes.
--
-- Root cause: contact_payments.treasury_account_id or trigger logic sometimes stores
-- treasuries.id instead of accounts.id, which violates journal_entry_lines_account_id_fkey.

-- 1) Diagnose orphaned treasury_account_id values
SELECT cp.id, cp.ref_no, cp.treasury_account_id, cp.created_at, cp.amount
FROM contact_payments cp
LEFT JOIN accounts a ON a.id = cp.treasury_account_id
WHERE cp.treasury_account_id IS NOT NULL
  AND a.id IS NULL
ORDER BY cp.created_at DESC
LIMIT 100;

-- 2) Diagnose treasuries missing account_id
SELECT t.id, t.name, t.owner_id, t.account_id
FROM treasuries t
WHERE t.account_id IS NULL
ORDER BY t.created_at DESC;

-- 3) Link treasuries to accounts (existing RPC)
SELECT sync_treasuries_from_accounts();

-- 4) Example: harden sync_contact_payment_to_accounting trigger
-- (Adapt to your live function body — inspect first:)
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'sync_contact_payment_to_accounting';
--
-- Inside the trigger, resolve cash account as:
--   SELECT t.account_id INTO _cash_account_id
--   FROM treasuries t
--   WHERE t.id = NEW.treasury_id OR t.account_id = NEW.treasury_account_id
--   LIMIT 1;
--   IF _cash_account_id IS NULL AND NEW.treasury_account_id IS NOT NULL THEN
--     SELECT id INTO _cash_account_id FROM accounts WHERE id = NEW.treasury_account_id;
--   END IF;
--   IF _cash_account_id IS NULL THEN
--     RAISE EXCEPTION 'treasury_not_linked_to_account';
--   END IF;
--   -- use _cash_account_id for journal_entry_lines.account_id — NEVER treasuries.id

-- 5) Example: harden process_standalone_return RPC
-- Same pattern: join treasuries.account_id from _treasury_id parameter before inserting journal lines.

-- 6) Optional cleanup for known bad rows (review diagnose output first)
-- UPDATE contact_payments cp
-- SET treasury_account_id = t.account_id
-- FROM treasuries t
-- WHERE cp.treasury_account_id = t.id
--   AND t.account_id IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = cp.treasury_account_id);
