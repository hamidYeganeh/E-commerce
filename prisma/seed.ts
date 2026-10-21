import "../src/config/load-env";
import { getDatabase, disconnectDatabase } from "../src/infrastructure/database/client";
import { seedFoundation } from "./seed-data";

async function main() {
  try {
    const result = await seedFoundation(getDatabase());
    console.info("Store defaults ensured; existing catalog, stock and notification settings preserved.", result);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(() => {
  console.error("Seed failed. Check database connectivity and migrations.");
  process.exitCode = 1;
});
