import { PoolClient } from "pg";
import { pool } from "../config/db";

/**
 * Runs `fn` inside ONE database transaction on ONE checked-out client.
 * Every query that must commit or roll back together has to go through
 * the `client` passed to `fn` — never through `pool.query`, which may
 * run on a different connection outside this transaction.
 *
 * Commits only if `fn` resolves; any throw rolls back everything and is
 * re-thrown unchanged.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
