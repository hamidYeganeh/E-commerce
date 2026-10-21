import { Suspense } from "react";
import { requirePageIdentity } from "@/modules/identity/request";
import { AdminShell } from "@/components/admin/admin-shell";
import { MfaSetup } from "@/components/auth/mfa-setup";
import { SessionControls } from "@/components/auth/session-controls";

export default function SecurityPage() { return <Suspense fallback={<p className="page-loading" role="status">در حال بررسی حساب…</p>}><Security /></Suspense>; }
async function Security() {
  const identity = await requirePageIdentity(true, true);
  return <AdminShell identity={identity} current="security"><div className="page-heading"><span className="eyebrow">حساب همکار</span><h1>امنیت حساب</h1><p className="muted">برنامه احراز هویت، کدهای بازیابی و نشست‌های فعال خود را مدیریت کنید.</p></div><MfaSetup enrolled={identity.twoFactorEnabled} />{identity.authMethod === "STAFF_MFA" && <SessionControls />}</AdminShell>;
}
