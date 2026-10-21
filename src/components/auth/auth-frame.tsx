import { LeafIcon, ShieldCheckIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function Brand() {
  return <Link href="/" className="brand" aria-label="صفحه اصلی فروشگاه"><span className="brand-mark" aria-hidden="true"><LeafIcon /></span><span>دکتر بیز<span className="brand-subtitle">انتخاب خوب، خرید آسوده</span></span></Link>;
}

export function AuthFrame({ children, staff = false }: { children: React.ReactNode; staff?: boolean }) {
  return <main className="auth-page" dir="rtl">
    <header className="auth-header"><Brand /><Button variant="ghost" asChild><Link href={staff ? "/login" : "/staff/login"}>{staff ? "ورود مشتریان" : "ورود همکاران"}<span aria-hidden="true"> ←</span></Link></Button></header>
    <div className="auth-content"><Card className="auth-card" aria-label={staff ? "ورود همکاران" : "ورود به حساب"}>{children}</Card>
      <aside className="auth-aside"><span className="eyebrow">خوش آمدید</span><h2>حساب شما،<br />همراه خریدهای شما.</h2><p>یک راه ساده برای دسترسی به حساب، مدیریت نشست‌ها و همراه‌بودن با فروشگاه.</p><div className="auth-note"><ShieldCheckIcon aria-hidden="true" /><p>اطلاعات ورود شما خصوصی است.<br />کد ورود و رمز خود را در اختیار دیگران نگذارید.</p></div></aside>
    </div><footer className="auth-footer">فروشگاه · ورود امن به حساب کاربری</footer>
  </main>;
}
