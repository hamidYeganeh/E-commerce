import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

export async function createTestDatabase() {
  const engine = await PGlite.create();
  const migrations = new URL("../../prisma/migrations/", import.meta.url);
  const entries = await readdir(migrations, { withFileTypes: true });
  for (const entry of entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await engine.exec(await readFile(new URL(`${entry.name}/migration.sql`, migrations), "utf8"));
  }
  const server = new PGLiteSocketServer({ db: engine, host: "127.0.0.1", port: 0, maxConnections: 5 });
  try {
    await server.start();
  } catch (error) {
    await server.stop();
    await engine.close();
    throw error;
  }
  const url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 }) });
  return {
    client, url,
    async close() {
      await client.$disconnect();
      await server.stop();
      await engine.close();
    },
  };
}
