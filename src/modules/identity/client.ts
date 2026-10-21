"use client";

const messages: Record<string, string> = {
  INVALID_PHONE_NUMBER: "شماره موبایل معتبر وارد کنید.", INVALID_OTP: "کد واردشده معتبر نیست یا منقضی شده است.",
  OTP_EXPIRED: "کد منقضی شده است. کد جدید دریافت کنید.", OTP_COOLDOWN: "برای دریافت کد جدید یک دقیقه صبر کنید.",
  INVALID_EMAIL_OR_PASSWORD: "ایمیل یا رمز عبور صحیح نیست.", INVALID_CREDENTIALS: "اطلاعات ورود صحیح نیست.",
  INVALID_CODE: "کد تأیید صحیح نیست.", INVALID_BACKUP_CODE: "کد بازیابی صحیح نیست یا قبلاً استفاده شده است.",
  SMS_UNAVAILABLE: "ارسال پیامک فعلاً در دسترس نیست. کمی بعد تلاش کنید.", AUTH_UNAVAILABLE: "سرویس ورود موقتاً در دسترس نیست.",
  PHONE_LOGIN_UNAVAILABLE: "ورود پیامکی برای این حساب در دسترس نیست. اگر همکار فروشگاه هستید از ورود همکاران استفاده کنید.",
  OTP_LIMIT: "تعداد درخواست کد زیاد است. بعداً تلاش کنید.", LOGIN_LIMIT: "تعداد تلاش‌ها زیاد است. بعداً تلاش کنید.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "تعداد تلاش‌ها زیاد است. دوباره وارد شوید.",
  ACCOUNT_TEMPORARILY_LOCKED: "ورود این حساب موقتاً محدود شده است. بعداً تلاش کنید.",
  INVALID_PASSWORD: "رمز عبور صحیح نیست.", INVALID_TWO_FACTOR_COOKIE: "مهلت تأیید تمام شده است. دوباره وارد شوید.",
};

export async function authPost<T = Record<string, unknown>>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch { throw new Error("ارتباط با سرویس برقرار نشد. اتصال اینترنت را بررسی کنید."); }
  let data;
  try { data = await response.json(); } catch { throw new Error("سرویس موقتاً در دسترس نیست. کمی بعد تلاش کنید."); }
  if (!response.ok) throw new Error(messages[data.code] ?? (response.status === 429 ? "تعداد درخواست‌ها زیاد است. کمی بعد تلاش کنید." : "انجام این کار ممکن نشد. دوباره تلاش کنید."));
  return data as T;
}
