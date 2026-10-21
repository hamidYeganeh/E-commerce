import Redis from "ioredis";
import { redisEnv } from "../../config/env";
import { logger } from "../logging/logger";

let client: Redis | undefined;

export function getRedis() {
  if (typeof window !== "undefined") throw new Error("Redis is server-only");
  if (!client) {
    client = new Redis(redisEnv().REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
    });
    client.on("error", () => logger.error({ component: "redis" }, "Redis connection error"));
  }
  return client;
}

export async function connectRedis() {
  const redis = getRedis();
  if (redis.status === "wait") await redis.connect();
  return redis;
}

export async function disconnectRedis() {
  client?.disconnect();
  client = undefined;
}
