import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

const steps = [
  {
    name: "add session_id column",
    sql: `ALTER TABLE treasury_transactions
      ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES cashier_sessions(id);`,
  },
  {
    name: "create index",
    sql: `CREATE INDEX IF NOT EXISTS idx_treasury_transactions_session_id
      ON treasury_transactions(session_id) WHERE session_id IS NOT NULL;`,
  },
  {
    name: "backfill standalone return links",
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
        WHERE table_schema='public' AND table_name='treasury_transactions' AND column_name='session_id') AS has_column,
      (SELECT COUNT(*)::int FROM treasury_transactions WHERE session_id IS NOT NULL) AS linked_treasury,
      (SELECT COUNT(*)::int FROM standalone_returns sr
        JOIN treasury_transactions tt ON tt.id = sr.treasury_transaction_id
        WHERE tt.session_id IS NOT NULL) AS linked_returns,
      (SELECT COUNT(*)::int FROM standalone_returns sr
        JOIN treasury_transactions tt ON tt.id = sr.treasury_transaction_id
        WHERE tt.session_id IS NULL) AS unlinked_returns
  `);
  console.log("verify:", verify.rows[0]);
} catch (e) {
  console.error("migration failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
