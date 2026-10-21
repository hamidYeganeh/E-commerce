import {Suspense} from 'react';
import Link from 'next/link';
import {AdminShell} from '@/components/admin/admin-shell';
import {BulkConsole} from '@/components/operations/bulk-console';
import {requirePageIdentity} from '@/modules/identity/request';
import {getDatabase} from '@/infrastructure/database/server';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
type Props={searchParams:Promise<{q?:string;page?:string}>};
export default function Page(props:Props){return <Suspense fallback={<p>در حال دریافت…</p>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:Props){const identity=await requirePageIdentity(true,false,'catalog.write'),db=getDatabase(),params=await searchParams,q=(params.q??'').slice(0,100),page=Math.max(1,Math.min(100000,Number.parseInt(params.page??'1')||1)),where=q?{OR:[{name:{contains:q,mode:'insensitive' as const}},{variants:{some:{sku:{contains:q,mode:'insensitive' as const}}}}]}:{};const [total,products,brands,categories]=await Promise.all([db.product.count({where}),db.product.findMany({where,take:100,skip:(page-1)*100,orderBy:[{updatedAt:'desc'},{id:'desc'}],select:{id:true,name:true,version:true,status:true}}),db.brand.findMany({select:{id:true,name:true}}),db.category.findMany({select:{id:true,name:true}})]);return <AdminShell identity={identity} current="operations"><form className="flex gap-3 mb-6"><Input aria-label="جست‌وجوی محصولات" name="q" defaultValue={q} placeholder="نام محصول یا SKU"/><Button variant="outline">جست‌وجو</Button></form><BulkConsole key={`${q}:${page}`} products={products} brands={brands} categories={categories} query={q}/><nav className="pagination" aria-label="صفحات ویرایش گروهی">{page>1&&<Link href={`?${new URLSearchParams({q,page:String(page-1)})}`}>قبل</Link>}<span>{page.toLocaleString('fa-IR')} · {total.toLocaleString('fa-IR')} محصول</span>{page*100<total&&<Link href={`?${new URLSearchParams({q,page:String(page+1)})}`}>بعد</Link>}</nav></AdminShell>;}
