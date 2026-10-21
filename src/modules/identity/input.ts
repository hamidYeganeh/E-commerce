import { z } from "zod";

export function asciiDigits(value: string) {
  return value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

export function normalizePhone(value: string): string {
  const phone = asciiDigits(value).replace(/[\s()-]/g, "");
  if (/^09\d{9}$/.test(phone)) return `+98${phone.slice(1)}`;
  if (/^989\d{9}$/.test(phone)) return `+${phone}`;
  if (/^00989\d{9}$/.test(phone)) return `+${phone.slice(2)}`;
  if (/^\+989\d{9}$/.test(phone)) return phone;
  throw new Error("INVALID_PHONE_NUMBER");
}

export const phoneSchema = z.string().max(32).transform((value, ctx) => {
  try { return normalizePhone(value); } catch {
    ctx.addIssue({ code: "custom", message: "شماره موبایل معتبر وارد کنید." });
    return z.NEVER;
  }
});

export function safeReturnPath(value: string | null | undefined, fallback = "/account") {
  if (!value || !value.startsWith("/") || value.startsWith("//") ||
      Array.from(value).some(char => char === "\\" || char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127)) return fallback;
  try {
    // Validate after WHATWG normalization as well: dot segments must not hide auth/API paths.
    const origin = "https://return.invalid";
    const destination = new URL(value, origin);
    if (destination.origin !== origin || /^\/(login|staff\/login|api)(\/|$)/.test(destination.pathname)) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch { return fallback; }
}
