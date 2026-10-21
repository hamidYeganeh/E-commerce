import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import Redis from "ioredis";

export async function createTestRedis() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No test port available");
  const port = address.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const child = spawn(process.env.REDIS_SERVER_BIN ?? "redis-server", ["--bind", "127.0.0.1", "--port", String(port), "--save", "", "--appendonly", "no", "--maxmemory-policy", "noeviction"], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise<void>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Redis startup timed out")), 5000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Redis exited")); });
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (output.includes("Ready to accept connections")) { clearTimeout(timer); resolve(); }
      });
    });
  } catch (error) { await stop(child); throw error; }
  const client = new Redis(`redis://127.0.0.1:${port}`, { lazyConnect: true, retryStrategy: null, maxRetriesPerRequest: 1 });
  client.on("error", () => {});
  await client.connect();
  return { client, async close() { client.disconnect(); await stop(child); } };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
}
