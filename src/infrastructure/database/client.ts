import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { databaseEnv } from "../../config/env";

const globalDatabase = globalThis as unknown as { commerceDb?: PrismaClient };

// Internal Node entry point shared with the worker and seed. Next consumers use server.ts.
export function getDatabase(): PrismaClient {
  if (typeof window !== "undefined") throw new Error("Database is server-only");
  if (!globalDatabase.commerceDb) {
    const env = databaseEnv();
    const url = new URL(env.DATABASE_URL);
    const schema = url.searchParams.get("schema") ?? "public";
    url.searchParams.delete("schema");
    const adapter = new PrismaPg({
      connectionString: url.toString(),
      max: env.DATABASE_POOL_SIZE,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    }, { schema });
    globalDatabase.commerceDb = new PrismaClient({ adapter });
  }
  return globalDatabase.commerceDb;
}

export async function disconnectDatabase() {
  await globalDatabase.commerceDb?.$disconnect();
  delete globalDatabase.commerceDb;
}
