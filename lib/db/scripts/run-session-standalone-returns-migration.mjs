import pg from "pg";
import { resolveDatabaseUrl } from "./load-env.mjs";

const { Client } = pg;

const { url, source } = resolveDatabaseUrl(
  process.argv.includes("--target=new") || process.env.MIGRATION_TARGET === "new",
);

if (!url) {
  console.error(
    "No database URL found. Set DATABASE_URL, NEW_DATABASE_URL, OLD_DATABASE_URL, or SUPABASE_DB_PASSWORD in .env",
  );
  process.exit(1);
}

console.log(`Using connection from: ${source}`);

const client = new Client({ connectionString: url });

const steps = [
  {
    name: "add treasury_transactions.session_id",
    sql: `ALTER TABLE treasury_transactions
      ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES cashier_sessions(id);`,
  },
  {
    name: "create treasury session index",
    sql: `CREATE INDEX IF NOT EXISTS idx_treasury_transactions_session_id
      ON treasury_transactions(session_id) WHERE session_id IS NOT NULL;`,
  },
  {
    name: "add standalone_returns metadata columns",
    sql: `ALTER TABLE standalone_returns
      ADD COLUMN IF NOT EXISTS payment_method text,
      ADD COLUMN IF NOT EXISTS contact_id uuid,
      ADD COLUMN IF NOT EXISTS contact_type text;`,
  },
  {
    name: "backfill standalone return session links",
    sql: `UPDATE treasury_transactions tt
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
        AND tt.session_id IS NULL;`,
  },
  {
    name: "backfill payment_method account",
    sql: `UPDATE standalone_returns sr
      SET payment_method = 'account'
      WHERE sr.payment_method IS NULL
        AND EXISTS (
          SELECT 1 FROM contact_payments cp
          WHERE cp.ref_no = sr.reference_no
            AND cp.notes LIKE '%مرتجع حر%'
        );`,
  },
  {
    name: "backfill payment_method cash",
    sql: `UPDATE standalone_returns sr
      SET payment_method = 'cash'
      WHERE sr.payment_method IS NULL;`,
  },
];

try {
  await client.connect();

  for (const step of steps) {
    const res = await client.query(step.sql);
    const rows = typeof res.rowCount === "number" ? ` (rows=${res.rowCount})` : "";
    console.log(`${step.name}: OK${rows}`);
  }

  const verify = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM information_schema.columns
        WHERE table_schema='public' AND table_name='treasury_transactions' AND column_name='session_id') AS has_treasury_session,
      (SELECT COUNT(*)::int FROM information_schema.columns
        WHERE table_schema='public' AND table_name='standalone_returns' AND column_name='payment_method') AS has_payment_method,
      (SELECT COUNT(*)::int FROM treasury_transactions WHERE session_id IS NOT NULL) AS linked_treasury,
      (SELECT COUNT(*)::int FROM standalone_returns WHERE payment_method IS NOT NULL) AS returns_with_method
  `);
  console.log("verify:", verify.rows[0]);
} catch (e) {
  console.error("migration failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
