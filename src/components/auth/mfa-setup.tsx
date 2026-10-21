"use client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";


import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { authPost } from "@/modules/identity/client";
import { asciiDigits } from "@/modules/identity/input";

export function MfaSetup({ enrolled }: { enrolled: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ uri: string; qr: string; backups: string[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [regenerated, setRegenerated] = useState<string[] | null>(null);

  async function enable(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await authPost<{ totpURI: string; backupCodes: string[] }>("/two-factor/enable", { password, method: "totp" });
      const qr = await QRCode.toDataURL(result.totpURI, { width: 220, margin: 1, errorCorrectionLevel: "M" });
      setSetup({ uri: result.totpURI, qr, backups: result.backupCodes }); setPassword("");
    } catch (error) { setError(error instanceof Error ? error.message : "فعال‌سازی انجام نشد."); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault(); if (!saved) return;
    setBusy(true); setError("");
    try { await authPost("/two-factor/verify-totp", { code: asciiDigits(code), trustDevice: false }); router.replace("/admin"); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "تأیید انجام نشد."); }
    finally { setBusy(false); }
  }
  async function regenerate(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await authPost<{ backupCodes: string[] }>("/two-factor/generate-backup-codes", { password });
      setRegenerated(result.backupCodes); setPassword("");
    } catch (error) { setError(error instanceof Error ? error.message : "ساخت کدها انجام نشد."); }
    finally { setBusy(false); }
  }
  return <Card className="panel security-panel">
    <CardHeader><span className="eyebrow">حفاظت از دسترسی مدیریت</span><CardTitle>{enrolled ? "تأیید دومرحله‌ای فعال است" : "فعال‌سازی تأیید دومرحله‌ای"}</CardTitle>
    <CardDescription>{enrolled ? "ورود به مدیریت با رمز عبور و کد برنامه احراز هویت انجام می‌شود." : "برای دسترسی به پنل، برنامه احراز هویت را به حساب خود متصل کنید. این مرحله حدود یک دقیقه زمان می‌برد."}</CardDescription></CardHeader><CardContent>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!enrolled && !setup && <form method="post" className="auth-form compact-form" onSubmit={enable}><FieldGroup><Field><FieldLabel htmlFor="enroll-password">رمز عبور فعلی</FieldLabel><Input id="enroll-password" type="password" autoComplete="current-password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /></Field><Button  disabled={busy}>{busy ? "در حال آماده‌سازی…" : "شروع فعال‌سازی"}</Button></FieldGroup></form>}
    {setup && <div className="setup-grid"><div className="qr-panel"><h3>۱. حساب را به برنامه اضافه کنید</h3><p>کد را با برنامه‌ای مانند Google Authenticator اسکن کنید.</p><Image unoptimized src={setup.qr} alt="کد اتصال حساب به برنامه احراز هویت" width={220} height={220} /><details><summary>ورود دستی به برنامه</summary><p>کلید زیر را در برنامه با نوع «مبتنی بر زمان» وارد کنید.</p><code className="secret-value" dir="ltr">{new URL(setup.uri).searchParams.get("secret")}</code></details></div>
      <div><h3>۲. کدهای بازیابی را نگه دارید</h3><p className="muted">هر کد فقط یک بار قابل استفاده است. این کدها را خارج از این دستگاه، در جای امن ذخیره کنید.</p><BackupCodes codes={setup.backups} /><form method="post" className="auth-form" onSubmit={verify}><FieldGroup><Field orientation="horizontal"><Checkbox id="backups-saved" checked={saved} onCheckedChange={(value) => setSaved(value === true)} required /><FieldLabel htmlFor="backups-saved">کدهای بازیابی را ذخیره کردم.</FieldLabel></Field><Field><FieldLabel htmlFor="enroll-code">۳. کد شش‌رقمی برنامه</FieldLabel><Input id="enroll-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9۰-۹٠-٩]{6}" dir="ltr" required maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} disabled={busy} /></Field><Button  disabled={busy || !saved}>{busy ? "در حال تأیید…" : "تأیید و ورود به مدیریت"}</Button></FieldGroup></form></div></div>}
    {enrolled && <div className="recovery-section"><h3>کدهای بازیابی جدید</h3><p className="muted">با ساخت کدهای جدید، کدهای قبلی دیگر قابل استفاده نخواهند بود.</p><form method="post" className="auth-form compact-form" onSubmit={regenerate}><FieldGroup><Field><FieldLabel htmlFor="recovery-password">رمز عبور فعلی</FieldLabel><Input id="recovery-password" autoComplete="current-password" type="password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /></Field><Button variant="outline" disabled={busy}>{busy ? "در حال ساخت…" : "ساخت کدهای جدید"}</Button></FieldGroup></form>{regenerated && <BackupCodes codes={regenerated} />}</div>}
  </CardContent></Card>;
}

function BackupCodes({ codes }: { codes: string[] }) {
  return <ul className="backup-codes" aria-label="کدهای بازیابی" dir="ltr">{codes.map((value) => <li key={value}><code>{value}</code></li>)}</ul>;
}
