"use client";
import { RestockButton } from "@/components/operations/public-forms";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldSet, FieldLegend } from "@/components/ui/field";
import { BreakfastStory } from "./editorial-banner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FieldLabel } from "@/components/ui/field";
import Link from "next/link";
import Image from "next/image";
import { AddToCart } from "@/components/commerce/add-to-cart";
import { useState } from "react";
import type { PublicProduct } from "@/modules/catalog/repository";
import { priceToman } from "@/components/catalog/format";
export function ProductDetail({ product,initialVariant }: { product: PublicProduct;initialVariant?:string }) {
  const [variantId, setVariantId] = useState(product.variants.find(v=>v.id===initialVariant)?.id ?? product.variants.find((v) => v.available)?.id ?? product.variants[0].id);
  const [mediaIndex, setMediaIndex] = useState(0);
  const variant = product.variants.find((v) => v.id === variantId)!;
  const media = product.media[mediaIndex];
  const primary = product.categories.find((c) => c.isPrimary);
  return <div className="store-container"><nav className="breadcrumbs" aria-label="مسیر صفحه"><Link href="/">خانه</Link><span>/</span><Link href="/products">محصولات</Link>{primary && <><span>/</span><Link href={`/categories/${primary.slug}`}>{primary.name}</Link></>}</nav><div className="product-detail-grid"><section className="product-gallery" aria-label="تصاویر محصول"><div className="product-main-image">{media && <Image src={media.url} alt={media.alt} fill unoptimized loading="eager" sizes="(max-width: 760px) 100vw, 50vw" />}</div>{product.media.length > 1 && <div className="product-thumbnails">{product.media.map((m, i) => <Button variant="outline" type="button" key={m.url} aria-label={`نمایش تصویر ${(i + 1).toLocaleString("fa-IR")}`} aria-pressed={i === mediaIndex} onClick={() => setMediaIndex(i)}><Image src={m.url} alt="" width={80} height={80} unoptimized /></Button>)}</div>}</section><Card className="product-detail-info"><CardHeader><Badge variant="outline">{product.brand?.name ?? primary?.name}</Badge><h1>{product.name}</h1></CardHeader><CardContent><p className="product-lead">{product.description.slice(0, 240)}{product.description.length > 240 ? "…" : ""}</p><FieldSet className="variant-picker"><FieldLegend variant="label">انتخاب تنوع محصول</FieldLegend><RadioGroup value={variantId} onValueChange={setVariantId} name="variant">{product.variants.map((v) => <FieldLabel htmlFor={`variant-${v.id}`} className={v.id === variantId ? "selected" : ""} key={v.id}><RadioGroupItem id={`variant-${v.id}`} value={v.id} /><span>{v.name}</span>{!v.available && <small>ناموجود</small>}</FieldLabel>)}</RadioGroup></FieldSet><div className="detail-price" aria-live="polite"><div><strong>{priceToman(variant.priceRial)}</strong><span>تومان</span></div><span className={`availability ${variant.available ? "available" : "unavailable"}`}>{variant.available ? "موجود" : "ناموجود"}</span></div><AddToCart key={variant.id} variantId={variant.id} available={variant.available} />{!variant.available&&<RestockButton key={variant.id} variantId={variant.id}/>}<dl className="product-specs">{variant.netWeightGrams && !variant.attributes.some((a) => a.key === "net-weight") && <div><dt>وزن خالص</dt><dd>{variant.netWeightGrams.toLocaleString("fa-IR")} گرم</dd></div>}{[...product.attributes, ...variant.attributes].map((a) => <div key={a.key}><dt>{a.name}</dt><dd>{a.value}{a.unit ? ` ${a.unit}` : ""}</dd></div>)}</dl>{product.tags.length > 0 && <div className="product-tags">{product.tags.map((t) => <Link key={t.slug} href={`/tags/${t.slug}`}>{t.name}</Link>)}</div>}</CardContent></Card></div><section className="product-description"><span className="eyebrow">دربارهٔ محصول</span><h2>توضیحات و مشخصات</h2><p>{product.description}</p></section><BreakfastStory /></div>;
}
