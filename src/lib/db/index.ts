import { PGlite, type Transaction } from "@electric-sql/pglite";
import path from "path";
import fs from "fs";
import { POSTGRES_DDL } from "./schema.sql";
import { seedDatabaseIfEmpty } from "./seed";

export type DbClient = PGlite | Transaction;

const globalForDb = globalThis as unknown as {
  __pgliteInstance?: PGlite;
  __pgliteInitPromise?: Promise<PGlite>;
};

function resolveDataDir(): string | undefined {
  // In test environment or serverless read-only environments, use in-memory PostgreSQL
  if (process.env.NODE_ENV === "test" || process.env.PGLITE_IN_MEMORY === "1" || process.env.VERCEL) {
    return undefined;
  }
  const dir = path.join(process.cwd(), ".pglite-data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function getDb(): Promise<PGlite> {
  if (globalForDb.__pgliteInstance) {
    return globalForDb.__pgliteInstance;
  }

  if (!globalForDb.__pgliteInitPromise) {
    globalForDb.__pgliteInitPromise = (async () => {
      const dataDir = resolveDataDir();
      const db = new PGlite(dataDir);
      await db.waitReady;
      await db.exec(POSTGRES_DDL);
      await db.transaction(async (tx) => {
        await seedDatabaseIfEmpty(tx);
      });
      globalForDb.__pgliteInstance = db;
      return db;
    })();
  }

  return globalForDb.__pgliteInitPromise;
}

/**
 * Executes an atomic ACID transaction in PostgreSQL.
 * PGlite serializes concurrent transactions at the connection mutex level while executing
 * full PostgreSQL SQL semantics (SELECT ... FOR UPDATE, CHECK constraints, ROLLBACK on error).
 */
export async function withTransaction<T>(
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    return await fn(tx);
  });
}

/**
 * Resets the database back to the clean initial seed state (useful for tests and portfolio demo reset).
 */
export async function resetDatabaseToSeed(): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.exec(`
      TRUNCATE TABLE
        payment_events,
        order_state_history,
        stock_reservations,
        order_items,
        orders,
        inventory_ledger,
        inventory_items,
        product_variants,
        products,
        warehouses,
        users
      RESTART IDENTITY CASCADE;
    `);
    await seedDatabaseIfEmpty(tx);
  });
}

export function createId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${random}`;
}
