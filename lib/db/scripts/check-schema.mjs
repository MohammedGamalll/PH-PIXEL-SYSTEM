import pg from "pg";

const c = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ||
    process.env.OLD_DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});

await c.connect();
const cols = await c.query(`
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('treasury_transactions', 'standalone_returns')
    AND column_name IN ('session_id', 'payment_method', 'contact_id', 'contact_type')
  ORDER BY 1, 2
`);
console.log("columns:", cols.rows);

for (const table of ["invoices", "products", "standalone_returns", "treasury_transactions", "cashier_sessions"]) {
  try {
    const r = await c.query(`SELECT COUNT(*)::int AS n FROM public.${table}`);
    console.log(`${table}:`, r.rows[0].n);
  } catch (e) {
    console.log(`${table}: ERROR`, e.message);
  }
}
await c.end();
