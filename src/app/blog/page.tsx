import {Suspense} from "react";
import Link from "next/link";
import Image from "next/image";
import {connection} from "next/server";
import {StoreShell} from "@/components/storefront/store-shell";
import {getDatabase} from "@/infrastructure/database/server";
import {recordSchemas} from "@/modules/operations/contracts";
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
export const metadata={title:"مجلهٔ فروشگاه",description:"مقاله‌ها و راهنمای انتخاب محصولات",alternates:{canonical:"/blog"}};
export default function Page({searchParams}:{searchParams:Promise<{page?:string}>}){return <StoreShell current="blog"><Suspense fallback={<p>در حال دریافت مقالات…</p>}><Content searchParams={searchParams}/></Suspense></StoreShell>;}
async function Content({searchParams}:{searchParams:Promise<{page?:string}>}){await connection();const page=Math.max(1,Math.min(100000,Number.parseInt((await searchParams).page??"1")||1)),db=getDatabase(),where={kind:"article",status:"ACTIVE"};const [total,articles]=await db.$transaction([db.storeRecord.count({where}),db.storeRecord.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],take:12,skip:(page-1)*12})]);return <div className="store-container py-10"><div className="page-heading"><span className="eyebrow">خواندنی‌های شیرین</span><h1>مجلهٔ فروشگاه</h1><p>راهنماها و نوشته‌های ما دربارهٔ انتخاب و استفاده از محصولات.</p></div><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{articles.map(a=>{const d=recordSchemas.article.parse(a.data);return <Card key={a.id}>{d.coverUrl&&<Image unoptimized src={d.coverUrl} alt={a.title} width={800} height={500} className="w-full aspect-[8/5] object-cover"/>}<CardHeader><CardTitle><Link href={`/blog/${a.slug}`}>{a.title}</Link></CardTitle><CardDescription>{a.createdAt.toLocaleDateString("fa-IR")}</CardDescription></CardHeader><CardContent><p>{d.excerpt}</p></CardContent><CardFooter><Button variant="outline" asChild><Link href={`/blog/${a.slug}`}>خواندن مقاله ←</Link></Button></CardFooter></Card>;})}</div>{!articles.length&&<p>هنوز مقاله‌ای منتشر نشده است.</p>}<nav className="pagination" aria-label="صفحات مجله">{page>1&&<Link href={`?page=${page-1}`}>صفحه قبل</Link>}<span>{page.toLocaleString("fa-IR")}</span>{page*12<total&&<Link href={`?page=${page+1}`}>صفحه بعد</Link>}</nav></div>;}
