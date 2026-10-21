import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";
import { requirePageIdentity } from "@/modules/identity/request";
import { Brand } from "@/components/auth/auth-frame";
import { SessionControls, SignOutButton } from "@/components/auth/session-controls";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "حساب کاربری", robots: { index: false, follow: false } };

export default function AccountPage() { return <Suspense fallback={<p className="page-loading" role="status">در حال دریافت حساب…</p>}><Account /></Suspense>; }
async function Account() {
  const identity = await requirePageIdentity();
  if (identity.authMethod === "STAFF_PASSWORD") redirect("/admin/security");
  return <div className="account-page">
    <header className="account-header"><Brand /><SignOutButton /></header>
    <main>
      <div className="page-heading"><span className="eyebrow">حساب کاربری</span><h1>خوش آمدید، {identity.user.name}</h1><p className="muted">اطلاعات حساب و دستگاه‌های متصل را اینجا ببینید.</p></div>
      <Card className="mb-6">
        <CardHeader><CardTitle role="heading" aria-level={2}>اطلاعات حساب</CardTitle></CardHeader>
        <CardContent><dl className="profile-details"><div><dt>نام</dt><dd>{identity.user.name}</dd></div>{identity.user.phoneNumber && <div><dt>شماره موبایل</dt><dd dir="ltr">{identity.user.phoneNumber}</dd></div>}{identity.user.email && <div><dt>ایمیل</dt><dd dir="ltr">{identity.user.email}</dd></div>}</dl></CardContent>
        {identity.roles.length > 0 && <CardFooter><Link className="text-link" href={identity.authMethod.startsWith("STAFF_") ? "/admin" : "/staff/login"}>ورود به فضای مدیریت ←</Link></CardFooter>}
      </Card>
      <Card className="mb-6">
        <CardHeader><CardTitle role="heading" aria-level={2}>خریدهای شما</CardTitle><CardDescription>وضعیت پرداخت و ارسال سفارش‌هایتان را دنبال کنید.</CardDescription></CardHeader>
        <CardFooter><Link className="text-link" href="/account/orders">سفارش‌های من ←</Link></CardFooter>
      </Card>
      <Card className="mb-6">
        <CardHeader><CardTitle role="heading" aria-level={2}>اعتبار و پیامک‌ها</CardTitle></CardHeader>
        <CardFooter><Link className="text-link" href="/account/wallet">کیف پول و ترجیحات اطلاع‌رسانی ←</Link><Link className="text-link" href="/account/addresses">دفترچهٔ نشانی ←</Link></CardFooter>
      </Card>
      <SessionControls />
    </main>
  </div>;
}
