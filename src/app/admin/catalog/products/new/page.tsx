import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { ProductEditor } from "@/components/catalog/product-editor";
import { requirePageIdentity } from "@/modules/identity/request";
import { getDatabase } from "@/infrastructure/database/server";
import { getLookups } from "@/modules/catalog/repository";
export const metadata = { title: "محصول جدید", robots: { index: false, follow: false } };
export default function Page() { return <Suspense fallback={<p className="page-loading">در حال بارگذاری…</p>}><Editor /></Suspense>; }
async function Editor() {
  const identity = await requirePageIdentity(true, false, "catalog.write");
  const lookups = await getLookups(getDatabase());
  return <AdminShell identity={identity} current="catalog"><h1>محصول جدید</h1><ProductEditor id={null} lookups={lookups} canWrite canInventory={identity.permissions.includes("inventory.write")} /></AdminShell>;
}
