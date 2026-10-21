import { Queue, type ConnectionOptions } from "bullmq";
import { workerEnv } from "../../config/env";

export const COMMERCE_QUEUE = "commerce-events";
export type EventJob = { eventId: string };

export function queueConnection(worker = false): ConnectionOptions {
  return {
    url: workerEnv().QUEUE_REDIS_URL,
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker,
    connectTimeout: 3000,
  };
}

export function createCommerceQueue() {
  return new Queue<EventJob>(COMMERCE_QUEUE, {
    connection: queueConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      // Retain ids for duplicate suppression; introduce explicit retention policy later.
      removeOnComplete: false,
      removeOnFail: false,
    },
  });
}
