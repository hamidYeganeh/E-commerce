import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "../../infrastructure/database/server";
import { getAuth } from "./runtime";
import { resolveIdentity, assertStaff } from "./session";
import { DomainError } from "../../shared/domain-error";
import type { PermissionKey } from "./permissions";
import { getSessionCookie } from "better-auth/cookies";

export async function requirePageIdentity(staff = false, enrollment = false, permission?: PermissionKey) {
  const incoming = await headers();
  if (!getSessionCookie(incoming)) redirect(staff ? "/staff/login" : "/login");
  try {
    const identity = await resolveIdentity(getDatabase(), getAuth(), incoming);
    if (staff) assertStaff(identity, permission, enrollment);
    if (staff && enrollment && identity.twoFactorEnabled && identity.authMethod !== "STAFF_MFA") throw new DomainError("STAFF_REAUTHENTICATION", "ورود مجدد لازم است.");
    return identity;
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === "MFA_REQUIRED") redirect("/admin/security");
      if (error.code === "FORBIDDEN") redirect("/account?access=denied");
      redirect(staff ? "/staff/login" : "/login");
    }
    // No auth/data secrets in the rendered error. Keep the response out of caches.
    throw new Error("سرویس حساب کاربری موقتاً در دسترس نیست. تنظیمات اتصال را بررسی کنید.");
  }
}
