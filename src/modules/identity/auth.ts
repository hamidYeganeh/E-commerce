import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { phoneNumber, twoFactor } from "better-auth/plugins";
import type { PrismaClient } from "../../generated/prisma/client";
import { RedisAuthStore } from "../../infrastructure/redis/auth-store";
import type { SmsSender } from "../../infrastructure/sms/kavenegar";
import { asciiDigits, normalizePhone } from "./input";

export type AuthSettings = { origin: string; secret: string; ipHeader?: string };
const mfaPaths = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

export function createCommerceAuth(db: PrismaClient, store: RedisAuthStore, sms: SmsSender, settings: AuthSettings) {
  return betterAuth({
    appName: "فروشگاه", baseURL: settings.origin, secret: settings.secret,
    database: prismaAdapter(db, { provider: "postgresql" }),
    trustedOrigins: [settings.origin],
    logger: { disabled: true },
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    user: { additionalFields: { disabledAt: { type: "date", required: false, input: false, returned: false } } },
    session: {
      expiresIn: 60 * 60 * 24 * 14, disableSessionRefresh: true,
      cookieCache: { enabled: false }, freshAge: 300,
      additionalFields: {
        authMethod: { type: "string", defaultValue: "CUSTOMER", input: false, returned: false },
        mfaVerifiedAt: { type: "date", required: false, input: false, returned: false },
      },
    },
    advanced: {
      useSecureCookies: settings.origin.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      // The deployment proxy must overwrite this header. Without one, use a shared conservative limit.
      ipAddress: { ipAddressHeaders: settings.ipHeader ? [settings.ipHeader] : [] },
    },
    rateLimit: {
      enabled: true, window: 60, max: 60, customStorage: store,
      customRules: {
        "/phone-number/send-otp": { window: 3600, max: 15 },
        "/phone-number/verify": { window: 60, max: 15 },
        "/sign-in/email": { window: 900, max: 10 },
        "/two-factor/*": { window: 60, max: 10 },
      },
    },
    plugins: [
      phoneNumber({
        otpLength: 6, expiresIn: 180, allowedAttempts: 5,
        phoneNumberValidator: (phone) => /^\+989\d{9}$/.test(phone),
        signUpOnVerification: {
          getTempEmail: (phone) => `${phone.slice(1)}@phone.invalid`,
          getTempName: () => "مشتری فروشگاه",
        },
        sendOTP: async ({ phoneNumber: phone, code }) => {
          if (!await store.issue(phone, code)) throw new APIError("TOO_MANY_REQUESTS", { code: "OTP_COOLDOWN", message: "برای دریافت کد جدید یک دقیقه صبر کنید." });
          try { await sms.sendCode(phone, code); } catch {
            await store.discard(phone, code);
            throw new APIError("SERVICE_UNAVAILABLE", { code: "SMS_UNAVAILABLE", message: "ارسال پیامک موقتاً در دسترس نیست." });
          }
        },
        verifyOTP: ({ phoneNumber: phone, code }) => store.verify(phone, code),
      }),
      twoFactor({ issuer: "فروشگاه", skipVerificationOnEnable: false, twoFactorCookieMaxAge: 300 }),
    ],
    databaseHooks: {
      verification: { create: { before: async (verification) => {
        // Phone OTPs are HMAC-protected in Redis; the library's compatibility row contains no code.
        if (/^\+989\d{9}$/.test(verification.identifier)) return { data: { ...verification, value: "redis-managed" } };
      } } },
      session: { create: { before: async (session, context) => {
        const user = await db.user.findUnique({ where: { id: session.userId }, include: { roles: true } });
        if (!user || user.disabledAt) throw new APIError("UNAUTHORIZED", { code: "ACCOUNT_UNAVAILABLE", message: "ورود به این حساب امکان‌پذیر نیست." });
        const isStaff = user.roles.length > 0;
        const path = context?.path;
        if (isStaff && path === "/phone-number/verify") throw new APIError("FORBIDDEN", { code: "STAFF_LOGIN_REQUIRED", message: "از مسیر ورود همکاران استفاده کنید." });
        if (isStaff && path !== "/sign-in/email" && !mfaPaths.has(path ?? "")) throw new APIError("FORBIDDEN", { code: "STAFF_LOGIN_REQUIRED", message: "ورود مجدد لازم است." });
        if (!isStaff && path !== "/phone-number/verify") throw new APIError("UNAUTHORIZED", { code: "INVALID_CREDENTIALS", message: "اطلاعات ورود معتبر نیست." });
        return { data: {
          ...session, authMethod: isStaff ? "STAFF_PASSWORD" : "CUSTOMER", mfaVerifiedAt: null,
          ...(isStaff ? { expiresAt: new Date(Date.now() + 10 * 60000) } : {}),
        } };
      } } },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith("/phone-number/")) {
          const allowedFields = new Set(["phoneNumber", "code", "disableSession", "updatePhoneNumber"]);
          if (Object.keys(ctx.body).some((key) => !allowedFields.has(key))) throw new APIError("BAD_REQUEST", { code: "FIELD_NOT_ALLOWED", message: "فیلدهای درخواست معتبر نیستند." });
          try { ctx.body.phoneNumber = normalizePhone(String(ctx.body.phoneNumber ?? "")); } catch {
            throw new APIError("BAD_REQUEST", { code: "INVALID_PHONE_NUMBER", message: "شماره موبایل معتبر وارد کنید." });
          }
          if (ctx.path.endsWith("/verify")) {
            ctx.body.code = asciiDigits(String(ctx.body.code ?? "")).trim();
            if (!/^\d{6}$/.test(ctx.body.code)) throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "کد شش‌رقمی را وارد کنید." });
            if (ctx.body.updatePhoneNumber) throw new APIError("FORBIDDEN", { code: "PHONE_CHANGE_DISABLED", message: "تغییر شماره از این مسیر مجاز نیست." });
            ctx.body.disableSession = false;
          }
          const user = await db.user.findUnique({ where: { phoneNumber: ctx.body.phoneNumber }, include: { roles: true } });
          if (user?.disabledAt || user?.roles.length) throw new APIError("FORBIDDEN", { code: "PHONE_LOGIN_UNAVAILABLE", message: "ورود پیامکی برای این حساب در دسترس نیست؛ در صورت داشتن حساب همکار، از ورود همکاران استفاده کنید." });
          if (ctx.path.endsWith("/send-otp")) {
            for (const rule of [{ name: "hour", window: 3600, max: 5 }, { name: "day", window: 86400, max: 10 }]) {
              if (!(await store.consume(`phone:${rule.name}:${ctx.body.phoneNumber}`, rule)).allowed) throw new APIError("TOO_MANY_REQUESTS", { code: "OTP_LIMIT", message: "تعداد درخواست‌ها زیاد است. بعداً تلاش کنید." });
            }
          }
        }
        if (ctx.path === "/sign-in/email") {
          ctx.body.email = String(ctx.body.email ?? "").trim().toLowerCase();
          ctx.body.rememberMe = false;
          if (!(await store.consume(`email:${ctx.body.email}`, { window: 900, max: 10 })).allowed) throw new APIError("TOO_MANY_REQUESTS", { code: "LOGIN_LIMIT", message: "تعداد تلاش‌ها زیاد است. بعداً تلاش کنید." });
        }
        if (ctx.path.startsWith("/two-factor/")) {
          ctx.body.trustDevice = false;
          if (ctx.body.code) ctx.body.code = asciiDigits(String(ctx.body.code)).trim();
          if (ctx.path === "/two-factor/enable") ctx.body.method = "totp";
          ctx.body.disableSession = false;
          const current = await getSessionFromCtx(ctx, { disableCookieCache: true, disableRefresh: true });
          if (current) {
            const session = await db.session.findUnique({ where: { id: current.session.id }, include: { user: { include: { roles: true } } } });
            if (!session || session.user.disabledAt || !session.user.roles.length || !session.authMethod.startsWith("STAFF_")) {
              throw new APIError("FORBIDDEN", { code: "STAFF_PASSWORD_REQUIRED", message: "ابتدا با رمز حساب همکار وارد شوید." });
            }
            if (session.authMethod !== "STAFF_MFA") {
              const allowed = session.user.twoFactorEnabled
                ? mfaPaths.has(ctx.path)
                : ["/two-factor/enable", "/two-factor/verify-totp"].includes(ctx.path);
              if (!allowed) throw new APIError("FORBIDDEN", { code: "MFA_REQUIRED", message: "ابتدا تأیید دومرحله‌ای را تکمیل کنید." });
            }
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const result = ctx.context.returned;
        if (result instanceof APIError) return;
        if (mfaPaths.has(ctx.path) && result && typeof result === "object" && "token" in result) {
          const current = ctx.context.newSession ?? ctx.context.session;
          if (!current) return;
          const user = await db.user.findUnique({ where: { id: current.user.id }, include: { roles: true, twoFactor: true } });
          if (!user || user.disabledAt || !user.roles.length || !user.twoFactorEnabled || !user.twoFactor?.verified) throw new APIError("FORBIDDEN", { code: "MFA_REQUIRED", message: "تأیید دومرحله‌ای لازم است." });
          await db.$transaction(async (tx) => {
            await tx.session.update({ where: { id: current.session.id }, data: { authMethod: "STAFF_MFA", mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 8 * 3600000) } });
            await tx.auditLog.create({ data: { actorId: user.id, action: "identity.mfa_verified", entityType: "Session", entityId: current.session.id } });
          });
        }
        if (ctx.path === "/get-session" && result && typeof result === "object" && "user" in result) {
          const user = result.user as { id: string };
          const stored = await db.user.findUnique({ where: { id: user.id }, select: { disabledAt: true } });
          if (!stored || stored.disabledAt) throw new APIError("UNAUTHORIZED", { code: "ACCOUNT_UNAVAILABLE", message: "حساب در دسترس نیست." });
        }
      }),
    },
  });
}

export type CommerceAuth = ReturnType<typeof createCommerceAuth>;
