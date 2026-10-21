import Link from "next/link";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { TaxonomyManager } from "@/components/catalog/taxonomy-manager";
import { requirePageIdentity } from "@/modules/identity/request";
import { getDatabase } from "@/infrastructure/database/server";
import { getLookups } from "@/modules/catalog/repository";
export const metadata = { title: "ساختار کاتالوگ", robots: { index: false, follow: false } };
export default function Page() { return <Suspense fallback={<p className="page-loading">در حال بارگذاری…</p>}><Taxonomy /></Suspense>; }
async function Taxonomy() {
  const identity = await requirePageIdentity(true, false, "catalog.read");
  const lookups = await getLookups(getDatabase());
  return <AdminShell identity={identity} current="catalog"><div className="page-heading"><Link className="text-link" href="/admin/catalog">→ محصولات</Link><h1>ساختار کاتالوگ</h1><p className="muted">دسته‌بندی و ویژگی‌ها را برای هر گروه کالا تعریف کنید؛ از عسل تا محصولات دیگر.</p></div><TaxonomyManager initial={lookups} canWrite={identity.permissions.includes("catalog.write")} /></AdminShell>;
}
