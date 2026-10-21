import { Suspense } from "react";
import { StoreShell } from "@/components/storefront/store-shell";
import { StoreListing, type SearchProps } from "@/components/storefront/listing";
export async function generateMetadata({ searchParams }: { searchParams: SearchProps }) {
  const params = await searchParams;
  return { title: "محصولات", description: "جست‌وجو و مقایسهٔ محصولات، قیمت و تنوع‌ها.", alternates: { canonical: "/products" }, robots: { index: !Object.values(params).some(Boolean), follow: true } };
}
export default function Page(props: { searchParams: SearchProps }) { return <StoreShell><Suspense fallback={<p className="page-loading">در حال دریافت محصولات…</p>}><StoreListing searchParams={props.searchParams} /></Suspense></StoreShell>; }
