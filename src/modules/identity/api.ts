import "server-only";
import { authEnv } from "../../config/env";
import { getDatabase } from "../../infrastructure/database/server";
import { logger } from "../../infrastructure/logging/logger";
import { DomainError } from "../../shared/domain-error";
import { getAuth } from "./runtime";
import { isSameOrigin } from "./http";
import { assertStaff, resolveIdentity, type Identity } from "./session";
import type { PermissionKey } from "./permissions";
import { getSessionCookie } from "better-auth/cookies";
import { connection } from "next/server";

export async function authenticatedApi(request: Request, action: (identity: Identity) => Promise<Response>, options: { staff?: boolean; permission?: PermissionKey } = {}) {
  await connection();
  try {
    if (!getSessionCookie(request.headers)) throw new DomainError("UNAUTHENTICATED", "ابتدا وارد حساب خود شوید.");
    if (!["GET", "HEAD"].includes(request.method) && !isSameOrigin(request, new URL(authEnv().BETTER_AUTH_URL).origin)) {
      return Response.json({ code: "INVALID_ORIGIN" }, { status: 403 });
    }
    const identity = await resolveIdentity(getDatabase(), getAuth(), request.headers);
    if (identity.authMethod === "STAFF_PASSWORD") assertStaff(identity);
    if (options.staff) assertStaff(identity, options.permission);
    const response = await action(identity);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof DomainError) return Response.json({ code: error.code, message: error.message }, { status: error.code === "UNAUTHENTICATED" ? 401 : 403, headers: { "Cache-Control": "no-store" } });
    logger.error({ component: "account-api" }, "Account operation unavailable");
    return Response.json({ code: "SERVICE_UNAVAILABLE", message: "سرویس موقتاً در دسترس نیست." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
