import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getDatabase } from "@/infrastructure/database/server";
import { requirePageIdentity } from "@/modules/identity/request";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminOrderFilters } from "@/components/orders/admin-order-filters";
import { orderStatusNames } from "@/components/orders/labels";
import { priceToman } from "@/components/catalog/format";
import { Badge } from "@/components/ui/badge";
import { listAdminOrders } from "@/modules/orders/admin-read";
import { DomainError } from "@/shared/domain-error";
export const metadata = { title: "مدیریت سفارش‌ها", robots: { index: false, follow: false } };
type Params = Promise<Record<string, string | string[] | undefined>>;
export default function Page({ searchParams }: { searchParams: Params }) { return <Suspense fallback={<p className="page-loading">در حال دریافت سفارش‌ها…</p>}><Orders searchParams={searchParams} /></Suspense>; }
async function Orders({ searchParams }: { searchParams: Params }) {
  const identity = await requirePageIdentity(true, false, "orders.read");
  const params = await searchParams;
  const t = await getTranslations("AdminOrders");
  let result: Awaited<ReturnType<typeof listAdminOrders>> | null = null;
  let error: string | undefined;
  try { result = await listAdminOrders(getDatabase(), identity.user.id, params); }
  catch (e) { if (!(e instanceof DomainError)) throw e; error = e.message; }
  const href = (status = "", page = 1) => {
    const query = new URLSearchParams();
    for (const key of ["q", "phone", "payment", "shipment", "from", "to"]) if (typeof params[key] === "string" && params[key]) query.set(key, params[key]);
    if (status) query.set("status", status);
    query.set("page", String(page));
    return `?${query}`;
  };
  return <AdminShell identity={identity} current="orders">
    <header className="page-heading"><p className="eyebrow">از ثبت تا تحویل</p><h1>سفارش‌های فروشگاه</h1><p className="muted">رسیدگی به سفارش‌ها، ثبت یادداشت و پیگیری ارسال در یک جا.</p></header>
    <AdminOrderFilters values={result ? { ...result.filters, page: String(result.filters.page) } : params} canSearchPhone={identity.permissions.includes("customers.read")} canReadPayments={identity.permissions.includes("payments.read")} error={error} />
    {result && <><p className="mt-6 text-muted-foreground">{t("metricsHint")}</p><div className="order-metrics">{(["AWAITING_PAYMENT", "CONFIRMED", "PROCESSING", "COMPLETED"] as const).map(s => <Link href={href(s)} className="panel" key={s}><span>{orderStatusNames[s]}</span><strong>{(result.counts.find(c => c.status === s)?._count ?? 0).toLocaleString("fa-IR")}</strong></Link>)}</div>
    <Card><CardHeader><CardTitle>فهرست سفارش‌ها</CardTitle><CardDescription>{result.total.toLocaleString("fa-IR")} سفارش مطابق فیلترهای انتخاب‌شده</CardDescription></CardHeader><CardContent>
      <nav className="order-filter-links" aria-label="وضعیت سفارش"><Link aria-current={!result.filters.status ? "page" : undefined} href={href()}>همه</Link>{Object.entries(orderStatusNames).map(([key, name]) => <Link key={key} href={href(key)} aria-current={key === result.filters.status ? "page" : undefined}>{name}</Link>)}</nav>
      {result.orders.length ? <div className="table-scroll"><Table className="catalog-table"><TableHeader><TableRow><TableHead>سفارش</TableHead><TableHead>مشتری</TableHead><TableHead>تاریخ ثبت</TableHead><TableHead>مبلغ (تومان)</TableHead><TableHead>وضعیت</TableHead><TableHead>جزئیات</TableHead></TableRow></TableHeader><TableBody>{result.orders.map(o => <TableRow key={o.id}><TableCell>#{o.number.toLocaleString("fa-IR")}<small>{o._count.items.toLocaleString("fa-IR")} ردیف</small></TableCell><TableCell>{o.user.name}</TableCell><TableCell>{o.createdAt.toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" })}</TableCell><TableCell>{priceToman(o.totalRial.toString())}</TableCell><TableCell><Badge variant={o.status === "CANCELLED" ? "destructive" : "secondary"}>{orderStatusNames[o.status]}</Badge></TableCell><TableCell><Link className="text-link" href={`/admin/orders/${o.id}`}>بررسی سفارش ←</Link></TableCell></TableRow>)}</TableBody></Table></div> : <Empty><EmptyHeader><EmptyTitle>سفارشی پیدا نشد</EmptyTitle><EmptyDescription>فیلترها را تغییر دهید یا برای دیدن همهٔ سفارش‌ها آن‌ها را پاک کنید.</EmptyDescription></EmptyHeader></Empty>}
    </CardContent><CardFooter><nav className="pagination" aria-label="صفحات سفارش‌ها">{result.filters.page > 1 && <Link href={href(result.filters.status, result.filters.page - 1)}>قبلی</Link>}<span>صفحهٔ {result.filters.page.toLocaleString("fa-IR")} · {result.total.toLocaleString("fa-IR")} سفارش</span>{result.filters.page * 20 < result.total && <Link href={href(result.filters.status, result.filters.page + 1)}>بعدی</Link>}</nav></CardFooter></Card></>}
  </AdminShell>;
}
