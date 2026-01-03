const { Pool } = require("pg");

let pool;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required (add it locally in .env and in Railway Variables)"
    );
  }

  // Railway Postgres typically requires SSL. Local Postgres usually doesn't.
  const ssl =
    process.env.PGSSLMODE === "disable"
      ? false
      : process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false;

  pool = new Pool({ connectionString, ssl });
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function tx(fn) {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

module.exports = {
  getPool,
  query,
  tx,
};
