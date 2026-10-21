"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";


import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authPost } from "@/modules/identity/client";
import { asciiDigits, normalizePhone, safeReturnPath } from "@/modules/identity/input";

export function CustomerLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  async function send() {
    setBusy(true); setError("");
    try {
      let normalized: string;
      try { normalized = normalizePhone(phone); } catch { throw new Error("شماره موبایل معتبر وارد کنید."); }
      await authPost("/phone-number/send-otp", { phoneNumber: normalized });
      setSent(true); setRemaining(60); setCode("");
    } catch (error) { setError(error instanceof Error ? error.message : "ارسال کد انجام نشد."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sent) { await send(); return; }
    setBusy(true); setError("");
    try {
      await authPost("/phone-number/verify", { phoneNumber: normalizePhone(phone), code: asciiDigits(code).trim() });
      const next = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
      router.replace(next.startsWith("/admin") ? "/account" : next); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "تأیید کد انجام نشد."); }
    finally { setBusy(false); }
  }
  return <>
    <span className="eyebrow">حساب مشتریان</span><h1>{sent ? "کد ورود را وارد کنید" : "ورود یا ساخت حساب"}</h1>
    <p className="form-description">{sent ? `کد شش‌رقمی به ${phone} ارسال شد.` : "شماره موبایلتان را وارد کنید؛ کد ورود برای شما پیامک می‌شود."}</p>
    <form method="post" onSubmit={submit} className="auth-form"><FieldGroup>
      {!sent ? <Field><FieldLabel htmlFor="phone">شماره موبایل</FieldLabel><Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={32} disabled={busy} /></Field>
        : <Field><FieldLabel htmlFor="otp">کد ورود</FieldLabel><Input id="otp" name="otp" autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9۰-۹٠-٩]{6}" maxLength={6} className="otp-input" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} required disabled={busy} /></Field>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button  disabled={busy} type="submit">{busy ? "لطفاً صبر کنید…" : sent ? "تأیید و ورود" : "دریافت کد ورود"}<span aria-hidden="true">←</span></Button>
      {sent && <div className="form-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => { setSent(false); setError(""); }}>ویرایش شماره</Button><Button type="button" variant="ghost" disabled={busy || remaining > 0} onClick={send}>{remaining ? `ارسال مجدد تا ${remaining} ثانیه` : "ارسال مجدد کد"}</Button></div>}
    </FieldGroup></form><p className="form-footnote">با تأیید شماره، اگر حسابی نداشته باشید برایتان ساخته می‌شود.</p>
  </>;
}
