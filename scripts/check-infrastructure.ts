import "../src/config/load-env";
import Redis from "ioredis";
import { getDatabase, disconnectDatabase } from "../src/infrastructure/database/client";
import { connectRedis, disconnectRedis } from "../src/infrastructure/redis/client";
import { workerEnv } from "../src/config/env";

async function main() {
  const queueRedis = new Redis(workerEnv().QUEUE_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000, retryStrategy: null });
  queueRedis.on("error", () => {});
  try {
    await getDatabase().$queryRaw`SELECT 1`;
    const redis = await connectRedis();
    if (await redis.ping() !== "PONG") throw new Error("REDIS_NOT_READY");
    const authPolicy = await redis.config("GET", "maxmemory-policy") as string[];
    if (authPolicy[1] !== "noeviction") throw new Error("AUTH_REDIS_REQUIRES_NOEVICTION");
    await queueRedis.connect();
    const policy = await queueRedis.config("GET", "maxmemory-policy") as string[];
    if (policy[1] !== "noeviction") throw new Error("QUEUE_REDIS_REQUIRES_NOEVICTION");
    console.info("PostgreSQL, auth Redis and queue Redis are ready; both Redis policies are noeviction.");
  } finally {
    queueRedis.disconnect();
    await disconnectRedis();
    await disconnectDatabase();
  }
}
main().catch(() => {
  console.error("Infrastructure check failed. Check connectivity and Redis eviction policies.");
  process.exitCode = 1;
});
