import pg from "pg";

const urls = [
  process.env.OLD_DATABASE_URL,
  process.env.NEW_DATABASE_URL,
  process.env.DATABASE_URL,
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
].filter(Boolean);

for (const u of urls) {
  const masked = u.replace(/:([^:@/]+)@/, ":***@");
  try {
    const c = new pg.Client({ connectionString: u });
    await c.connect();
    const tables = await c.query(
      "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public'",
    );
    let invoices = -1;
    try {
      const inv = await c.query("SELECT COUNT(*)::int AS n FROM invoices");
      invoices = inv.rows[0].n;
    } catch {
      invoices = -1;
    }
    console.log(JSON.stringify({ url: masked, tables: tables.rows[0].n, invoices }));
    await c.end();
  } catch (e) {
    console.log(JSON.stringify({ url: masked, error: e.message }));
  }
}
