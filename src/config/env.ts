import { z } from "zod";

const databaseSchema = z.object({
  DATABASE_URL: z.url().refine((url) => /^postgres(ql)?:/.test(url), "Expected PostgreSQL URL"),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(5),
});

const redisSchema = z.object({
  REDIS_URL: z.url().refine((url) => /^rediss?:/.test(url), "Expected Redis URL"),
});

const workerSchema = z.object({
  QUEUE_REDIS_URL: z.url().refine((url) => /^rediss?:/.test(url), "Expected Redis URL"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(5000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(50),
});

// Validate lazily: Next builds and domain tests do not need live infrastructure.
export const databaseEnv = () => databaseSchema.parse(process.env);
export const redisEnv = () => redisSchema.parse(process.env);
export const workerEnv = () => workerSchema.parse(process.env);

const authSchema = z.object({
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  KAVENEGAR_API_KEY: z.string().optional(),
  KAVENEGAR_OTP_TEMPLATE: z.string().optional(),
  AUTH_IP_HEADER: z.enum(["x-forwarded-for", "x-real-ip", "cf-connecting-ip"]).optional(),
}).superRefine((value, ctx) => {
  const url = new URL(value.BETTER_AUTH_URL);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    ctx.addIssue({ code: "custom", path: ["BETTER_AUTH_URL"], message: "Production auth requires HTTPS" });
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    ctx.addIssue({ code: "custom", path: ["BETTER_AUTH_URL"], message: "Use a plain application origin" });
  }
});
export const authEnv = () => authSchema.parse(process.env);
