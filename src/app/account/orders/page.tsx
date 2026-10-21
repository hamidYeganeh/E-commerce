import { pageNumber,historyPageSize } from "@/shared/pagination";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Suspense } from "react";
import Link from "next/link";
import { requirePageIdentity } from "@/modules/identity/request";
import { getDatabase } from "@/infrastructure/database/server";
import { StoreShell } from "@/components/storefront/store-shell";
import { orderStatusNames } from "@/components/orders/labels";
import { priceToman } from "@/components/catalog/format";
import { Badge } from "@/components/ui/badge";
export const metadata = { title: "سفارش‌های من", robots: { index: false, follow: false } };
export default function Page({searchParams}:{searchParams:Promise<{page?:string}>}) { return <StoreShell current="account"><Suspense fallback={<p className="page-loading">در حال دریافت سفارش‌ها…</p>}><Orders searchParams={searchParams}/></Suspense></StoreShell>; }
async function Orders({searchParams}:{searchParams:Promise<{page?:string}>}) {
  const identity = await requirePageIdentity();
  const page=pageNumber((await searchParams).page);
  const total=await getDatabase().order.count({where:{userId:identity.user.id}});
  const orders = await getDatabase().order.findMany({ where: { userId: identity.user.id }, orderBy: [{ createdAt: "desc" },{id:"desc"}], take: historyPageSize,skip:(page-1)*historyPageSize });
  return <div className="commerce-page"><header className="commerce-heading"><div><p className="eyebrow">حساب شما</p><h1>سفارش‌های من</h1><p>نتیجهٔ پرداخت و وضعیت آماده‌سازی و ارسال را اینجا ببینید.</p></div><Link className="text-link" href="/account">حساب کاربری ←</Link></header>{orders.length ? <div className="customer-orders">{orders.map(o => <Link href={`/account/orders/${o.id}`} className="panel" key={o.id}><div><h2>سفارش #{o.number.toLocaleString("fa-IR")}</h2><p>{o.createdAt.toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" })}</p></div><Badge variant="secondary">{orderStatusNames[o.status]}</Badge><strong>{priceToman(o.totalRial.toString())} تومان</strong><span>جزئیات ←</span></Link>)}</div> : <Empty><EmptyHeader><EmptyTitle>هنوز سفارشی ثبت نکرده‌اید</EmptyTitle><EmptyDescription>پس از ثبت سفارش، وضعیت آن را در این صفحه دنبال کنید.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" asChild><Link href="/products">دیدن محصولات ←</Link></Button></EmptyContent></Empty>}<nav className="pagination" aria-label="صفحات سفارش‌ها">{page>1&&<Link href={`?page=${page-1}`}>صفحه قبل</Link>}<span>صفحه {page.toLocaleString("fa-IR")}</span>{page*historyPageSize<total&&<Link href={`?page=${page+1}`}>صفحه بعد</Link>}</nav></div>;
}
