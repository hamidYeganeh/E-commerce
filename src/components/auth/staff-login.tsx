"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";


import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authPost } from "@/modules/identity/client";
import { asciiDigits } from "@/modules/identity/input";

export function StaffLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(false);
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (challenge) {
        await authPost(backup ? "/two-factor/verify-backup-code" : "/two-factor/verify-totp", { code: asciiDigits(code).trim(), trustDevice: false });
        router.replace("/admin"); router.refresh();
      } else {
        const data = await authPost<{ twoFactorRedirect?: boolean }>("/sign-in/email", { email, password, rememberMe: false });
        setPassword("");
        if (data.twoFactorRedirect) { setChallenge(true); setCode(""); }
        else { router.replace("/admin/security"); router.refresh(); }
      }
    } catch (error) { setError(error instanceof Error ? error.message : "ورود انجام نشد."); }
    finally { setBusy(false); }
  }
  return <>
    <span className="eyebrow">فضای همکاران</span><h1>{challenge ? "تأیید دومرحله‌ای" : "ورود به مدیریت"}</h1>
    <p className="form-description">{challenge ? (backup ? "یکی از کدهای بازیابی ذخیره‌شده را وارد کنید." : "کد برنامه احراز هویت خود را وارد کنید.") : "با ایمیل و رمز حساب همکار خود وارد شوید."}</p>
    <form method="post" className="auth-form" onSubmit={submit}><FieldGroup>
      {!challenge ? <><Field><FieldLabel htmlFor="email">ایمیل</FieldLabel><Input id="email" name="email" type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} /></Field><Field><FieldLabel htmlFor="password">رمز عبور</FieldLabel><Input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={128} disabled={busy} /></Field></>
        : <Field><FieldLabel htmlFor="factor-code">{backup ? "کد بازیابی" : "کد برنامه احراز هویت"}</FieldLabel><Input key={String(backup)} id="factor-code" name="code" autoFocus dir="ltr" inputMode={backup ? "text" : "numeric"} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={backup ? 32 : 6} disabled={busy} /></Field>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button  type="submit" disabled={busy}>{busy ? "در حال بررسی…" : challenge ? "تأیید و ورود" : "ادامه ورود"}<span aria-hidden="true">←</span></Button>
      {challenge && <Button variant="ghost" type="button" onClick={() => { setBackup(!backup); setCode(""); setError(""); }}>{backup ? "استفاده از برنامه احراز هویت" : "استفاده از کد بازیابی"}</Button>}
    </FieldGroup></form><p className="form-footnote">دسترسی به مدیریت پس از تأیید دومرحله‌ای فعال می‌شود.</p>
  </>;
}
