import { Card } from "@/components/ui/card";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ProductEditor } from "@/components/catalog/product-editor";
import { requirePageIdentity } from "@/modules/identity/request";
import { getDatabase } from "@/infrastructure/database/server";
import { getLookups, productInclude, productToInput } from "@/modules/catalog/repository";
export const metadata = { title: "ویرایش محصول", robots: { index: false, follow: false } };
export default function Page(props: { params: Promise<{ id: string }> }) { return <Suspense fallback={<p className="page-loading">در حال بارگذاری محصول…</p>}><Editor params={props.params} /></Suspense>; }
async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePageIdentity(true, false, "catalog.read");
  const db = getDatabase();
  const { id } = await params;
  const [product, lookups] = await Promise.all([db.product.findUnique({ where: { id }, include: productInclude }), getLookups(db)]);
  if (!product) notFound();
  const canInventoryRead = identity.permissions.includes("inventory.read");
  const events = await db.auditLog.findMany({ where: { OR: [{ entityType: "Product", entityId: product.id }, ...(canInventoryRead ? [{ entityType: "Stock", entityId: { in: product.variants.map((v) => v.id) } }] : [])] }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } } });
  return <AdminShell identity={identity} current="catalog"><h1>{product.name}</h1><ProductEditor id={id} initial={productToInput(product)} lookups={lookups} initialStocks={canInventoryRead ? product.variants.flatMap((v) => v.stock ? [v.stock] : []) : []} canWrite={identity.permissions.includes("catalog.write")} canInventory={identity.permissions.includes("inventory.write")} /><Card className="panel"><h2>آخرین تغییرات</h2>{events.length ? <ul className="audit-list">{events.map((event) => <li key={event.id}><span>{{ "product.created": "ایجاد محصول", "product.updated": "ویرایش محصول", "stock.adjusted": "اصلاح موجودی" }[event.action] ?? event.action} · {event.actor?.name ?? "سیستم"}</span><time dateTime={event.createdAt.toISOString()}>{event.createdAt.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}</time></li>)}</ul> : <p className="muted">تغییری ثبت نشده است.</p>}</Card></AdminShell>;
}
