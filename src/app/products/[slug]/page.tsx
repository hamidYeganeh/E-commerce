import {ProductExtensions} from "@/components/operations/public-content";
import {JsonLd} from "@/components/operations/structured-data";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { StoreShell, StoreUnavailable } from "@/components/storefront/store-shell";
import { ProductDetail } from "@/components/storefront/product-detail";
import { readPublicProduct } from "@/modules/catalog/public-read";
type Props = { params: Promise<{ slug: string }>;searchParams?:Promise<{variant?:string}> };
export async function generateMetadata({ params }: Props) {
  await connection();
  const { product } = await readPublicProduct((await params).slug);
  if (!product) return { title: "محصول", robots: { index: false, follow: true } };
  return { title: product.seoTitle || product.name, description: product.seoDescription || product.description.slice(0, 160), alternates: { canonical: `/products/${product.slug}` }, openGraph: { title: product.name, description: product.description.slice(0, 160), images: product.media.map((m) => ({ url: m.url, alt: m.alt })) } };
}
export default function Page(props: Props) { return <StoreShell><Suspense fallback={<p className="page-loading">در حال دریافت محصول…</p>}><Content params={props.params} searchParams={props.searchParams} /></Suspense></StoreShell>; }
async function Content({ params,searchParams }: Props) {
  await connection();
  const result = await readPublicProduct((await params).slug);
  if (!result.available) return <StoreUnavailable />;
  if (!result.product) notFound();
  const p=result.product;return <><ProductDetail product={p} initialVariant={(await searchParams)?.variant}/><ProductExtensions id={p.id}/><JsonLd data={{"@context":"https://schema.org","@type":"Product",name:p.name,description:p.description,image:p.media.map(m=>m.url),brand:p.brand?{"@type":"Brand",name:p.brand.name}:undefined,offers:p.variants.map(v=>({"@type":"Offer",priceCurrency:"IRR",price:v.priceRial,availability:v.available?"https://schema.org/InStock":"https://schema.org/OutOfStock",url:`/products/${p.slug}`}))}}/></>;
}
