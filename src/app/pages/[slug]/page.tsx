import {Suspense} from "react";
import {connection} from "next/server";
import {notFound} from "next/navigation";
import {getDatabase} from "@/infrastructure/database/server";
import {editablePage} from "@/modules/operations/pages";
import {StoreShell} from "@/components/storefront/store-shell";
import {Card,CardHeader,CardTitle,CardContent} from "@/components/ui/card";
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props){await connection();const p=await editablePage(getDatabase(),(await params).slug);return p?{title:p.seoTitle||p.title,description:p.seoDescription,alternates:{canonical:`/pages/${p.slug}`}}:{title:"صفحه",robots:{index:false,follow:true}};}
export default function Page(props:Props){return <StoreShell><Suspense fallback={<p>در حال دریافت صفحه…</p>}><Content {...props}/></Suspense></StoreShell>;}
async function Content({params}:Props){await connection();const p=await editablePage(getDatabase(),(await params).slug);if(!p)notFound();return <section className="store-container py-12"><Card><CardHeader><CardTitle><h1>{p.title}</h1></CardTitle></CardHeader><CardContent><div className="whitespace-pre-wrap leading-loose">{p.body}</div></CardContent></Card></section>;}
