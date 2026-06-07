import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "./load-env.mjs";
import { resolveDatabaseUrl } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dumpDir = path.join(__dirname, ".clone-dumps");

const oldResolved = resolveDatabaseUrl(false);
const newResolved = resolveDatabaseUrl(true);

const oldUrl = process.env.OLD_DATABASE_URL || oldResolved.url;
const newUrl = process.env.NEW_DATABASE_URL || newResolved.url;

if (!oldUrl || !newUrl) {
  console.error("Set OLD_DATABASE_URL and NEW_DATABASE_URL in .env before cloning.");
  process.exit(1);
}

if (oldUrl === newUrl) {
  console.error("OLD_DATABASE_URL and NEW_DATABASE_URL must be different.");
  process.exit(1);
}

fs.mkdirSync(dumpDir, { recursive: true });
const schemaFile = path.join(dumpDir, "schema.sql");
const dataFile = path.join(dumpDir, "data.sql");

function runDockerPgDump(args, outFile) {
  const conn = extractConnArgs(oldUrl);
  const cmd = [
    "run", "--rm",
    "-e", `PGPASSWORD=${extractPassword(oldUrl)}`,
    "postgres:17-alpine",
    "pg_dump",
    ...args,
    ...conn,
  ];
  console.log("pg_dump", args.join(" "), conn.join(" "));
  const res = spawnSync("docker", cmd, { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 });
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    throw new Error(`pg_dump failed: ${args.join(" ")}`);
  }
  fs.writeFileSync(outFile, res.stdout, "utf8");
  console.log("wrote", outFile, `(${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`);
}

function runDockerPsql(filePath, targetUrl) {
  const sql = fs.readFileSync(filePath, "utf8");
  const conn = extractConnArgs(targetUrl);
  const cmd = [
    "run", "--rm", "-i",
    "-e", `PGPASSWORD=${extractPassword(targetUrl)}`,
    "postgres:17-alpine",
    "psql",
    ...conn,
  ];
  console.log("psql restore", path.basename(filePath));
  const res = spawnSync("docker", cmd, { input: sql, encoding: "utf8", maxBuffer: 1024 * 1024 * 512 });
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    throw new Error(`psql restore failed for ${filePath}`);
  }
}

function extractPassword(url) {
  try {
    return decodeURIComponent(new URL(url).password || "");
  } catch {
    return "";
  }
}

function extractConnArgs(url) {
  const u = new URL(url);
  const host = u.hostname === "127.0.0.1" ? "host.docker.internal" : u.hostname;
  return [
    "-h", host,
    "-p", u.port || "5432",
    "-U", decodeURIComponent(u.username || "postgres"),
    "-d", u.pathname.replace(/^\//, "") || "postgres",
  ];
}

console.log("Clone source:", oldUrl.replace(/:([^:@/]+)@/, ":***@"));
console.log("Clone target:", newUrl.replace(/:([^:@/]+)@/, ":***@"));

runDockerPgDump(
  ["--schema-only", "--no-owner", "--no-privileges", "-n", "public", "-n", "auth", "-n", "storage"],
  schemaFile,
);
runDockerPgDump(
  ["--data-only", "--disable-triggers", "-n", "public", "-n", "auth", "-n", "storage"],
  dataFile,
);

runDockerPsql(schemaFile, newUrl);
runDockerPsql(dataFile, newUrl);

console.log("Clone complete.");
