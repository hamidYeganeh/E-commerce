import {applyRetention} from "../modules/operations/retention";
import "../config/load-env";
import {scheduleAutomations,processNotifications} from "../modules/operations/notifications";
import { Worker } from "bullmq";
import { getDatabase, disconnectDatabase } from "../infrastructure/database/client";
import { logger } from "../infrastructure/logging/logger";
import { COMMERCE_QUEUE, createCommerceQueue, queueConnection, type EventJob } from "../infrastructure/queue/commerce-queue";
import { workerEnv } from "../config/env";
import { reconcilePayments } from "./payments";
import { dispatchOutbox, processOutboxEvent } from "./outbox";

async function main() {
  const env = workerEnv();
  const db = getDatabase();
  await db.$queryRaw`SELECT 1`;
  const queue = createCommerceQueue();
  queue.on("error", () => logger.error({ component: "queue" }, "Queue connection error"));
  const worker = new Worker<EventJob>(COMMERCE_QUEUE, async (job) => {
    try {
      await processOutboxEvent(db, job.data.eventId);
    } catch {
      await db.outboxEvent.updateMany({
        where: { id: job.data.eventId, processedAt: null },
        data: { attempts: { increment: 1 }, lastError: "PROCESSING_FAILED" },
      });
      throw new Error("OUTBOX_PROCESSING_FAILED");
    }
  }, { connection: queueConnection(true), concurrency: 5 });
  worker.on("error", () => logger.error({ component: "worker" }, "Worker connection error"));
  worker.on("completed", (job) => logger.info({ eventId: job.data.eventId }, "Event processed"));
  worker.on("failed", (job) => logger.error({ eventId: job?.data.eventId, attempts: job?.attemptsMade }, "Event processing failed"));

  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dispatching: Promise<void> = Promise.resolve();
  let lastRetention=0;
  const tick = async () => {
    try {
      await dispatchOutbox(db, queue, env.WORKER_BATCH_SIZE);
    } catch {
      logger.error({ component: "outbox" }, "Dispatch failed; will retry");
    }
    try {
      const result = await reconcilePayments(db);
      if (result?.checked || result?.errors) logger.info({ component: "payments", ...result }, "Payment reconciliation batch finished");
    } catch {
      logger.error({ component: "payments" }, "Payment reconciliation unavailable; will retry");
    }
    try {
      await scheduleAutomations(db);
    } catch {
      logger.error({ component: "notification-scheduler" }, "Notification scheduling unavailable; will retry");
    }
    try {
      await processNotifications(db);
    } catch {
      logger.error({ component: "notifications" }, "Notification processing unavailable; will retry");
    }
    try {
      if(Date.now()-lastRetention>86400000){await applyRetention(db);lastRetention=Date.now();}
      await db.storeRecord.upsert({where:{kind_slug:{kind:"system",slug:"worker-pulse"}},create:{kind:"system",slug:"worker-pulse",title:"Worker heartbeat",status:"ACTIVE",data:{}},update:{version:{increment:1}}});
    } catch {logger.error({component:"maintenance"},"Maintenance or heartbeat failed");}
    if (!stopping) timer = setTimeout(() => { dispatching = tick(); }, env.WORKER_POLL_INTERVAL_MS);
  };

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    if (timer) clearTimeout(timer);
    await dispatching;
    await worker.close();
    await queue.close();
    await disconnectDatabase();
    logger.info("Worker stopped");
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => { shutdown().catch(() => { process.exitCode = 1; }); });
  }
  dispatching = tick();
  logger.info("Worker started");
}

main().catch(async () => {
  logger.error("Worker startup failed; check database and Redis configuration");
  await disconnectDatabase();
  process.exitCode = 1;
});
