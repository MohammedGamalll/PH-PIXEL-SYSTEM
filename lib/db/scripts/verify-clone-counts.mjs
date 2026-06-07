import pg from "pg";
import "./load-env.mjs";

const urls = [
  { label: "OLD", url: process.env.OLD_DATABASE_URL },
  { label: "NEW", url: process.env.NEW_DATABASE_URL },
].filter((x) => x.url);

const tables = ["invoices", "products", "standalone_returns", "treasury_transactions", "cashier_sessions", "profiles", "employees"];

for (const { label, url } of urls) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  console.log(`\n=== ${label} ===`);
  for (const table of tables) {
    try {
      const r = await c.query(`SELECT COUNT(*)::int AS n FROM public.${table}`);
      console.log(`${table}: ${r.rows[0].n}`);
    } catch (e) {
      console.log(`${table}: ERROR ${e.message}`);
    }
  }
  try {
    const auth = await c.query("SELECT COUNT(*)::int AS n FROM auth.users");
    console.log(`auth.users: ${auth.rows[0].n}`);
  } catch (e) {
    console.log(`auth.users: ERROR ${e.message}`);
  }
  await c.end();
}
