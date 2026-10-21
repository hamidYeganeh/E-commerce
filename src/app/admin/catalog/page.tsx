import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Link from "next/link";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { requirePageIdentity } from "@/modules/identity/request";
import { getDatabase } from "@/infrastructure/database/server";
import { listAdminProducts } from "@/modules/catalog/repository";
import { priceToman, statusNames } from "@/components/catalog/format";

export const metadata = { title: "مدیریت محصولات", robots: { index: false, follow: false } };
export default function CatalogPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <Suspense fallback={<p className="page-loading">در حال بارگذاری کاتالوگ…</p>}><Catalog searchParams={props.searchParams} /></Suspense>; }
async function Catalog({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await requirePageIdentity(true, false, "catalog.read");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const page = typeof params.page === "string" ? Math.max(1, Math.min(100000, Number.parseInt(params.page) || 1)) : 1;
  const data = await listAdminProducts(getDatabase(), q, page, identity.permissions.includes("inventory.read"));
  const canWrite = identity.permissions.includes("catalog.write");
  return <AdminShell identity={identity} current="catalog"><div className="page-heading section-heading"><div><span className="eyebrow">کاتالوگ فروشگاه</span><h1>محصولات</h1><p className="muted">{data.total.toLocaleString("fa-IR")} محصول ثبت‌شده</p></div><div className="row-actions"><Button variant="outline" asChild><Link href="/admin/catalog/taxonomy">دسته‌بندی و ویژگی‌ها</Link></Button>{canWrite && <Button variant="default" asChild><Link href="/admin/catalog/products/new">+ محصول جدید</Link></Button>}</div></div><Card className="panel"><form className="catalog-search" action="/admin/catalog"><label className="sr-only" htmlFor="catalog-query">نام یا کد محصول</label><Input id="catalog-query" name="q" defaultValue={q} maxLength={100} placeholder="جست‌وجوی نام یا کد محصول…" /><Button type="submit" variant="outline">جست‌وجو</Button></form><div className="table-scroll"><Table className="catalog-table"><TableHeader><TableRow><TableHead>محصول</TableHead><TableHead>وضعیت</TableHead><TableHead>قیمت (تومان)</TableHead>{identity.permissions.includes("inventory.read") && <TableHead>موجودی قابل فروش</TableHead>}<TableHead><span className="sr-only">عملیات</span></TableHead></TableRow></TableHeader><TableBody>{data.items.map((p) => <TableRow key={p.id}><TableCell><Link href={`/admin/catalog/products/${p.id}`}>{p.name}</Link><small>{p.variants.length.toLocaleString("fa-IR")} تنوع</small></TableCell><TableCell><Badge variant={p.status === "ACTIVE" ? "secondary" : "outline"}>{statusNames[p.status]}</Badge></TableCell><TableCell>{p.variants.length ? priceToman(p.variants.reduce((min, v) => BigInt(v.priceRial) < BigInt(min) ? v.priceRial : min, p.variants[0].priceRial)) : "—"}</TableCell>{identity.permissions.includes("inventory.read") && <TableCell>{p.variants.reduce((sum, v) => sum + (v.available ?? 0), 0).toLocaleString("fa-IR")}</TableCell>}<TableCell><Link className="text-link" href={`/admin/catalog/products/${p.id}`}>{canWrite ? "ویرایش ←" : "جزئیات ←"}</Link></TableCell></TableRow>)}</TableBody></Table></div>{!data.items.length && <p className="empty-state">{q ? "محصولی با این عبارت پیدا نشد." : "هنوز محصولی ثبت نشده است."}</p>}<nav className="pagination" aria-label="صفحات محصولات">{page > 1 && <Link href={`?${new URLSearchParams({ q, page: String(page - 1) })}`}>→ صفحه قبل</Link>}<span>صفحه {page.toLocaleString("fa-IR")}</span>{page * 20 < data.total && <Link href={`?${new URLSearchParams({ q, page: String(page + 1) })}`}>صفحه بعد ←</Link>}</nav></Card></AdminShell>;
}
