import { Suspense } from "react";
import { connection } from "next/server";
import { StoreShell } from "@/components/storefront/store-shell";
import { StoreListing, type SearchProps } from "@/components/storefront/listing";
import { readPublicListing } from "@/modules/catalog/public-read";
type Props = { params: Promise<{ slug: string }>; searchParams: SearchProps };
export async function generateMetadata({ params, searchParams }: Props) {
  await connection();
  const { slug } = await params;
  const data = await readPublicListing({ category: slug });
  const item = data?.categories.find((c) => c.slug === slug);
  return { title: item?.seoTitle || item?.name || "محصولات", description: item?.seoDescription || item?.description || undefined, alternates: { canonical: `/categories/${slug}` }, robots: { index: !!item && !Object.values(await searchParams).some(Boolean), follow: true } };
}
export default function Page(props: Props) { return <StoreShell><Suspense fallback={<p className="page-loading">در حال دریافت محصولات…</p>}><Content {...props} /></Suspense></StoreShell>; }
async function Content({ params, searchParams }: Props) { const { slug } = await params; return <StoreListing searchParams={searchParams} scope={{ kind: "category", slug }} />; }
