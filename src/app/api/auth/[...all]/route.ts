import { getAuth } from "@/modules/identity/runtime";
import { handleAuthRequest } from "@/modules/identity/http";
import { authEnv } from "@/config/env";
import { logger } from "@/infrastructure/logging/logger";
import { connection } from "next/server";

async function handle(request: Request) {
  await connection();
  try {
    return await handleAuthRequest(getAuth(), request, new URL(authEnv().BETTER_AUTH_URL).origin);
  } catch {
    logger.error({ component: "auth" }, "Authentication service unavailable");
    return Response.json({ code: "AUTH_UNAVAILABLE", message: "سرویس ورود موقتاً در دسترس نیست." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export const GET = handle;
export const POST = handle;
