import type { PrismaClient } from "../../generated/prisma/client";
import { DomainError } from "../../shared/domain-error";
import type { CommerceAuth } from "./auth";
import { APIError } from "better-auth/api";
import type { PermissionKey } from "./permissions";

export async function resolveIdentity(db: PrismaClient, auth: CommerceAuth, headers: Headers) {
  const verified = await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }).catch((error: unknown) => {
    if (error instanceof APIError && (error.statusCode === 401 || error.statusCode === 403)) throw new DomainError("UNAUTHENTICATED", "نشست شما معتبر نیست.");
    throw error;
  });
  if (!verified) throw new DomainError("UNAUTHENTICATED", "ابتدا وارد حساب خود شوید.");
  const session = await db.session.findUnique({ where: { id: verified.session.id }, include: { user: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } } } });
  if (!session || session.userId !== verified.user.id || session.expiresAt <= new Date() || session.user.disabledAt) throw new DomainError("UNAUTHENTICATED", "نشست شما معتبر نیست.");
  const { user } = session;
  return {
    sessionId: session.id, authMethod: session.authMethod, mfaVerifiedAt: session.mfaVerifiedAt,
    expiresAt: session.expiresAt,
    user: { id: user.id, name: user.name, phoneNumber: user.phoneNumber, email: user.email?.endsWith("@phone.invalid") ? null : user.email },
    roles: user.roles.map(({ role }) => role.key),
    permissions: [...new Set(user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))],
    twoFactorEnabled: user.twoFactorEnabled,
  };
}
export type Identity = Awaited<ReturnType<typeof resolveIdentity>>;

export function assertStaff(identity: Identity, permission?: PermissionKey, enrollment = false) {
  if (!identity.roles.length || !identity.authMethod.startsWith("STAFF_")) throw new DomainError("FORBIDDEN", "این بخش مخصوص همکاران فروشگاه است.");
  if (!enrollment && (identity.authMethod !== "STAFF_MFA" || !identity.mfaVerifiedAt || !identity.twoFactorEnabled)) throw new DomainError("MFA_REQUIRED", "تأیید دومرحله‌ای را تکمیل کنید.");
  if (permission && !identity.permissions.includes(permission)) throw new DomainError("FORBIDDEN", "دسترسی این عملیات را ندارید.");
}
