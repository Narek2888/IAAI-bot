require("dotenv").config();

const fs = require("fs");
const path = require("path");

const db = require("./db");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  );
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function getAppliedMigrations() {
  const res = await db.query("SELECT name FROM schema_migrations");
  return new Set(res.rows.map((r) => r.name));
}

async function applyMigration(name, sql) {
  await db.tx(async (client) => {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
      name,
    ]);
  });
}

async function migrate() {
  await ensureMigrationsTable();

  const files = listMigrationFiles();
  const applied = await getAppliedMigrations();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await applyMigration(file, sql);
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log("Migrations applied");
      process.exit(0);
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error("Migration failed:", e);
      process.exit(1);
    });
}
