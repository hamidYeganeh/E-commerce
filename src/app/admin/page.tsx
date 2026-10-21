import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import { requirePageIdentity } from "@/modules/identity/request";
import { getDatabase } from "@/infrastructure/database/server";
import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminPage() { return <Suspense fallback={<p className="page-loading" role="status">در حال بررسی دسترسی…</p>}><Overview /></Suspense>; }
async function Overview() {
  const identity = await requirePageIdentity(true);
  const db = getDatabase();
  const canCatalog = identity.permissions.includes("catalog.read") || identity.permissions.includes("catalog.write");
  const canOrders = identity.permissions.includes("orders.read");
  const [products, orders] = await Promise.all([
    canCatalog ? db.product.count() : Promise.resolve(null),
    canOrders ? db.order.count({ where: { status: { in: ["CONFIRMED", "PROCESSING"] } } }) : Promise.resolve(null),
  ]);
  return <AdminShell identity={identity}><div className="page-heading"><span className="eyebrow">مدیریت فروشگاه</span><h1>سلام، {identity.user.name}</h1><p className="muted">نشست شما تأیید شده است. دسترسی‌ها بر اساس مسئولیت شما در فروشگاه تعیین می‌شوند.</p></div><div className="metric-grid">{products !== null && <Card><CardContent><span className="muted">محصولات ثبت‌شده</span><strong className="metric-number">{products.toLocaleString("fa-IR")}</strong></CardContent></Card>}{orders !== null && <Card><CardContent><span className="muted">سفارش‌های در حال رسیدگی</span><strong className="metric-number">{orders.toLocaleString("fa-IR")}</strong></CardContent></Card>}</div><nav className="admin-shortcuts" aria-label="دسترسی سریع">{canOrders && <Button asChild><Link href="/admin/orders">مدیریت سفارش‌ها ←</Link></Button>}{canCatalog && <Button variant="outline" asChild><Link href="/admin/catalog">مدیریت محصولات ←</Link></Button>}<Button variant="outline" asChild><Link href="/products">مشاهدهٔ فروشگاه ←</Link></Button></nav><Card><CardContent><span className="eyebrow">دسترسی‌های حساب</span><h2>مسئولیت‌های شما</h2><div className="badge-list">{identity.roles.map((role) => <Badge variant="secondary" key={role}>{roleNames[role] ?? role}</Badge>)}</div><p className="muted">برای مدیریت نشست‌ها و کدهای بازیابی به بخش امنیت حساب بروید.</p></CardContent></Card></AdminShell>;
}
const roleNames: Record<string, string> = { owner: "مالک فروشگاه", orders: "مسئول سفارش", warehouse: "انباردار", finance: "مالی", content: "محتوا", support: "پشتیبانی" };
