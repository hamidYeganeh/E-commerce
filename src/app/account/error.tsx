"use client";
import { Button } from "@/components/ui/button";

export default function AccountError({ reset }: { reset: () => void }) { return <main className="page-loading" dir="rtl"><h1>دریافت حساب ممکن نشد</h1><p>سرویس موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.</p><Button  onClick={reset}>تلاش دوباره</Button></main>; }
