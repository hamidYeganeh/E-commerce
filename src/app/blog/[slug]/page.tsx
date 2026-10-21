import {Suspense} from "react";
import Link from "next/link";
import Image from "next/image";
import {connection} from "next/server";
import {notFound} from "next/navigation";
import {StoreShell} from "@/components/storefront/store-shell";
import {getDatabase} from "@/infrastructure/database/server";
import {recordSchemas,ids} from "@/modules/operations/contracts";
import {getPublicProduct} from "@/modules/catalog/repository";
import {ProductCard} from "@/components/storefront/product-card";
import {PageCommunity} from "@/components/operations/public-content";
import {Visit} from "@/components/operations/visit";
import {JsonLd} from "@/components/operations/structured-data";
type Props={params:Promise<{slug:string}>};
async function article(slug:string){return getDatabase().storeRecord.findFirst({where:{kind:"article",slug,status:"ACTIVE"}});}
export async function generateMetadata({params}:Props){await connection();const a=await article((await params).slug);if(!a)return{title:"مقاله",robots:{index:false,follow:true}};const d=recordSchemas.article.parse(a.data);return{title:d.seoTitle||a.title,description:d.seoDescription||d.excerpt,alternates:{canonical:`/blog/${a.slug}`},openGraph:{type:"article" as const,title:a.title,images:d.coverUrl?[d.coverUrl]:[]}};}
export default function Page(props:Props){return <StoreShell current="blog"><Suspense fallback={<p>در حال دریافت…</p>}><Content {...props}/></Suspense></StoreShell>;}
async function Content({params}:Props){await connection();const a=await article((await params).slug);if(!a)notFound();const db=getDatabase(),d=recordSchemas.article.parse(a.data),refs=await db.product.findMany({where:{id:{in:ids(d.productIds)}},select:{slug:true}}),products=(await Promise.all(refs.map(p=>getPublicProduct(db,p.slug)))).filter(p=>p!==null);return <><article className="store-container max-w-4xl py-12"><Link href="/blog">← همهٔ مقالات</Link><h1 className="my-6 text-3xl sm:text-5xl">{a.title}</h1><p>{a.createdAt.toLocaleDateString("fa-IR")}</p>{d.coverUrl&&<Image src={d.coverUrl} alt={a.title} width={1400} height={800} unoptimized className="w-full h-auto rounded-xl my-8"/>}<div className="whitespace-pre-wrap leading-loose text-lg my-8">{d.body}</div></article>{products.length>0&&<section className="store-container"><h2>محصولات این مقاله</h2><div className="product-grid">{products.map(p=><ProductCard key={p.id} product={{...p,listingPriceRial:p.variants.reduce((min,v)=>BigInt(v.priceRial)<BigInt(min)?v.priceRial:min,p.variants[0].priceRial)}}/>)}</div></section>}<Visit kind="article" targetId={a.id}/><PageCommunity type="article" id={a.id}/><JsonLd data={{"@context":"https://schema.org","@type":"Article",headline:a.title,datePublished:a.createdAt.toISOString(),dateModified:a.updatedAt.toISOString(),image:d.coverUrl||undefined,description:d.excerpt}}/></>;}
