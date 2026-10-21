import type { Queue } from "bullmq";
import type { PrismaClient } from "../generated/prisma/client";
import type { EventJob } from "../infrastructure/queue/commerce-queue";

export async function dispatchOutbox(db: PrismaClient, queue: Queue<EventJob>, batchSize: number) {
  const events = await db.outboxEvent.findMany({
    where: { processedAt: null, availableAt: { lte: new Date() } },
    orderBy: { availableAt: "asc" }, take: batchSize,
    select: { id: true, topic: true },
  });
  for (const event of events) {
    // Stable job ids deduplicate concurrent dispatchers and survive a failed DB acknowledgement.
    await queue.add(event.topic, { eventId: event.id }, { jobId: event.id });
    await db.outboxEvent.updateMany({
      where: { id: event.id, processedAt: null },
      data: { dispatchedAt: new Date(), availableAt: new Date(Date.now() + 60000) },
    });
  }
  return events.length;
}

export async function processOutboxEvent(db: PrismaClient, eventId: string) {
  const event = await db.outboxEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (event.processedAt) return;
  // Only the foundation smoke-test event is enabled. No fake SMS/payment success.
  if (event.topic !== "system.ping") throw new Error("UNSUPPORTED_EVENT_TOPIC");
  await db.outboxEvent.updateMany({
    where: { id: event.id, processedAt: null },
    data: { processedAt: new Date(), lastError: null },
  });
}
