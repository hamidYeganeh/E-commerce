import {Banners,PageCommunity} from "@/components/operations/public-content";
import {getDatabase} from "@/infrastructure/database/server";
import { EditorialBanner, BreakfastStory } from "./editorial-banner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import Link from "next/link";
import {Fragment} from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { readPublicListing } from "@/modules/catalog/public-read";
import type { PublicFilters } from "@/modules/catalog/repository";
import { StoreUnavailable } from "./store-shell";
import { ProductCard } from "./product-card";
import { StoreFilterPanel } from "./filters";

export type SearchProps = Promise<Record<string, string | string[] | undefined>>;
export function cleanFilters(params: Record<string, string | string[] | undefined>): PublicFilters {
  return Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([key, value]) => [key, value.slice(0, 500)]));
}
export async function StoreListing({ searchParams, scope }: { searchParams: SearchProps; scope?: { kind: "category" | "tag"; slug: string } }) {
  await connection();
  const filters = { ...cleanFilters(await searchParams), ...(scope ? { [scope.kind]: scope.slug } : {}) };
  const data = await readPublicListing(filters);
  if (!data) return <StoreUnavailable />;
  const category = scope?.kind === "category" ? data.categories.find((c) => c.slug === scope.slug) : null;
  const tag = scope?.kind === "tag" ? data.tags.find((t) => t.slug === scope.slug) : null;
  if (scope && !category && !tag) notFound();
  const title = category?.name ?? tag?.name ?? "همهٔ محصولات";
  const pageLink = (page: number) => `/products?${new URLSearchParams(Object.entries({ ...filters, page: String(page) }).filter((entry): entry is [string, string] => !!entry[1]))}`;
  return <div className="store-container"><nav className="breadcrumbs" aria-label="مسیر صفحه"><Link href="/">خانه</Link><span>/</span><span>{title}</span></nav><EditorialBanner label="از طبیعت، برای لحظه‌های شما" title={title} description={category?.description || tag?.description || "طعم‌های آشنا، انتخاب‌های تازه. محصول دلخواهتان را با خیال آسوده بررسی و انتخاب کنید."} /><div className="store-list-layout"><aside><StoreFilterPanel key={JSON.stringify(filters)} data={data} filters={filters} /></aside><section><div className="listing-count"><span>{data.total.toLocaleString("fa-IR")} محصول</span>{filters.q && <span>نتایج «{filters.q}»</span>}</div>{data.items.length ? <div className={`product-grid${data.items.length === 1 ? " product-grid--single" : ""}`}>{data.items.map((p,i) => <Fragment key={p.id}><ProductCard product={p} />{i===Math.min(3,data.items.length-1)&&<Banners placement="listing" categoryId={category?.id}/>}</Fragment>)}</div> : <Empty><EmptyHeader><EmptyTitle>محصولی پیدا نشد</EmptyTitle><EmptyDescription>عبارت جست‌وجو یا فیلترها را تغییر دهید.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" asChild><Link href="/products">نمایش همهٔ محصولات</Link></Button></EmptyContent></Empty>}<nav className="pagination" aria-label="صفحات محصولات">{data.page > 1 && <Link href={pageLink(data.page - 1)}>→ قبلی</Link>}<span>صفحه {data.page.toLocaleString("fa-IR")}</span>{data.page * 12 < data.total && <Link href={pageLink(data.page + 1)}>بعدی ←</Link>}</nav></section></div>{category&&<PageCommunity type="category" id={category.id}/ >}{tag&&<PageCommunity type="tag" id={(await getDatabase().tag.findUniqueOrThrow({where:{slug:tag.slug},select:{id:true}})).id}/ >}<BreakfastStory /></div>;
}
