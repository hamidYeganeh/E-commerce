import Link from "next/link";
import Image from "next/image";
import { PackageIcon } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/motion";
import { ExploreArrow } from "@/components/motion/explore-arrow";
import type { PublicProduct } from "@/modules/catalog/repository";
import { priceToman } from "@/components/catalog/format";
export function ProductCard({ product }: { product: PublicProduct & { listingPriceRial?: string } }) {
  const price = product.listingPriceRial ?? product.variants.reduce((min, v) => BigInt(v.priceRial) < BigInt(min) ? v.priceRial : min, product.variants[0]?.priceRial ?? "0");
  const available = product.variants.some(v => v.available);
  return <Reveal><Card className="product-card" size="sm"><Link className="product-card-image" href={`/products/${product.slug}`} tabIndex={-1} aria-hidden="true">{product.media[0] && <Image src={product.media[0].url} alt="" fill unoptimized loading="eager" sizes="(max-width: 600px) 90vw, 35vw" />}<Badge variant="secondary" className="product-stock">{available ? "موجود در فروشگاه" : "ناموجود"}</Badge></Link><CardContent className="product-card-info"><span className="product-brand">{product.brand?.name ?? product.categories.find(c => c.isPrimary)?.name}</span><h2><Link href={`/products/${product.slug}`}>{product.name}</Link></h2><p className="product-card-excerpt">{product.description.slice(0, 110)}{product.description.length > 110 ? "…" : ""}</p><span className="product-card-weight"><PackageIcon aria-hidden="true" />{product.variants.length === 1 ? product.variants[0].name : `${product.variants.length.toLocaleString("fa-IR")} تنوع قابل انتخاب`}</span></CardContent><CardFooter className="product-card-bottom"><span>{product.variants.length > 1 ? "از " : ""}<strong>{priceToman(price)}</strong> <small>تومان</small></span><Button variant="outline" className="t-learn" asChild><Link href={`/products/${product.slug}`}>دیدن محصول<ExploreArrow /></Link></Button></CardFooter></Card></Reveal>;
}
