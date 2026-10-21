import "../src/config/load-env";
import { getDatabase, disconnectDatabase } from "../src/infrastructure/database/client";

async function main() {
  try {
    const event = await getDatabase().outboxEvent.create({ data: { topic: "system.ping", aggregateId: "foundation", payload: {} } });
    console.info("Queued foundation event:", event.id);
  } finally {
    await disconnectDatabase();
  }
}
main().catch(() => { console.error("Could not create foundation event."); process.exitCode = 1; });
