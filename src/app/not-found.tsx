import Link from "next/link";
export default function NotFound() { return <main className="empty-state not-found"><span className="eyebrow">۴۰۴</span><h1>این صفحه پیدا نشد</h1><p className="muted">ممکن است محصول از فروشگاه خارج شده باشد یا آدرس تغییر کرده باشد.</p><Link className="button button-primary" href="/products">بازگشت به محصولات</Link></main>; }
