import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { Queue } from "bullmq";
import { createTestDatabase } from "../helpers/database";
import { COMMERCE_QUEUE, type EventJob } from "../../src/infrastructure/queue/commerce-queue";
import { dispatchOutbox } from "../../src/workers/outbox";

const redisBinary = process.env.REDIS_SERVER_BIN ?? "redis-server";
const redisAvailable = spawnSync(redisBinary, ["--version"], { stdio: "ignore" }).status === 0;

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function waitForOutput(child: ChildProcess, marker: string) {
  return new Promise<void>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => finish(new Error(`Process did not report ${marker}`)), 10000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(marker)) finish();
    };
    const onExit = () => finish(new Error(`Process exited before ${marker}`));
    const finish = (error?: Error) => {
      clearTimeout(timer);
      child.stdout?.off("data", onData);
      child.off("exit", onExit);
      child.off("error", finish);
      if (error) reject(error); else resolve();
    };
    child.stdout?.on("data", onData);
    child.once("exit", onExit);
    child.once("error", finish);
  });
}

async function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  child.kill("SIGTERM");
  try { await exited; } finally { clearTimeout(timer); }
}

test("actual Worker consumes durable outbox events via Redis and repeated dispatch stays unique", {
  skip: !redisAvailable && "Install redis-server or set REDIS_SERVER_BIN to run the queue integration test",
  timeout: 30000,
}, async (t) => {
  const cleanup: Array<() => Promise<unknown>> = [];
  t.after(async () => { for (const close of cleanup.reverse()) await close(); });
  const fixture = await createTestDatabase();
  cleanup.push(() => fixture.close());
  const port = await availablePort();
  const redis = spawn(redisBinary, [
    "--bind", "127.0.0.1", "--port", String(port), "--save", "", "--appendonly", "no",
    "--maxmemory-policy", "noeviction",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  cleanup.push(() => stopProcess(redis));
  await waitForOutput(redis, "Ready to accept connections");

  const url = `redis://127.0.0.1:${port}`;
  const queue = new Queue<EventJob>(COMMERCE_QUEUE, {
    connection: { url, maxRetriesPerRequest: 1 },
    defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
  });
  cleanup.push(() => queue.close());
  const child = spawn(process.execPath, ["--import", "tsx", "src/workers/main.ts"], {
    env: {
      ...process.env, DATABASE_URL: fixture.url, DATABASE_POOL_SIZE: "1", QUEUE_REDIS_URL: url,
      WORKER_POLL_INTERVAL_MS: "100", LOG_LEVEL: "info",
    }, stdio: ["ignore", "pipe", "pipe"],
  });
  cleanup.push(() => stopProcess(child));
  await waitForOutput(child, "Worker started");

  const event = await fixture.client.outboxEvent.create({ data: { topic: "system.ping", aggregateId: "queue-test", payload: {} } });
  await dispatchOutbox(fixture.client, queue, 50);
  const deadline = Date.now() + 10000;
  while (!(await fixture.client.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).processedAt) {
    if (Date.now() > deadline) assert.fail("Worker did not process the outbox event");
    await delay(50);
  }
  await queue.add("system.ping", { eventId: event.id }, { jobId: event.id });
  const count = await queue.getJobCountByTypes("completed", "active", "waiting", "delayed");
  assert.equal(count, 1);
  assert.equal((await fixture.client.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).attempts, 0);
  await stopProcess(child);
  assert.equal(child.exitCode, 0, "Worker should shut down gracefully on SIGTERM");
});
