import {Suspense} from 'react';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {AdminShell} from '@/components/admin/admin-shell';
import {RecordConsole,type ManagedRecord} from '@/components/operations/record-console';
import {operationForms} from '@/modules/operations/fields';
import {listRecords,recordKind,recordPermissions} from '@/modules/operations/records';
import {requirePageIdentity} from '@/modules/identity/request';
import {getDatabase} from '@/infrastructure/database/server';
import {jsonSafe} from '@/shared/json';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
export const metadata={title:'مدیریت فروشگاه',robots:{index:false,follow:false}};
type Props={params:Promise<{kind:string}>;searchParams:Promise<{q?:string;page?:string}>};
export default function Page(props:Props){return <Suspense fallback={<p>در حال دریافت…</p>}><Content {...props}/></Suspense>;}
async function Content({params,searchParams}:Props){
 const {kind}=await params;if(!Object.hasOwn(operationForms,kind))notFound();const query=await searchParams,q=(query.q??'').slice(0,100),page=Math.max(1,Math.min(100000,Number.parseInt(query.page??'1')||1));
 const identity=await requirePageIdentity(true,false,kind==='coupons'?'promotions.write':recordPermissions[recordKind(kind)]),db=getDatabase();
 let records:ManagedRecord[],total:number;
 if(kind==='coupons'){const where=q?{code:{contains:q.toUpperCase()}}:{};total=await db.coupon.count({where});records=(await db.coupon.findMany({where,orderBy:{id:'desc'},take:25,skip:(page-1)*25})).map(r=>({id:r.id,slug:r.code,title:r.code,status:r.isActive?'ACTIVE':'DRAFT',version:r.version,data:jsonSafe({...r,amountRial:r.amountRial??0n,maxDiscountRial:r.maxDiscountRial??0n,usageLimit:r.usageLimit??0})}));}
 else{const result=await listRecords(db,identity.user.id,recordKind(kind),q,page);total=result.total;records=jsonSafe(result.records).map(r=>({...r,data:r.data as Record<string,unknown>}));}
 const [product,category,tag,article]=await Promise.all([db.product.findMany({select:{id:true,name:true},take:1000}),db.category.findMany({select:{id:true,name:true,slug:true},take:1000}),db.tag.findMany({select:{id:true,name:true},take:1000}),db.storeRecord.findMany({where:{kind:'article'},select:{id:true,title:true},take:1000})]);
 const href=(p:number)=>`?${new URLSearchParams({q,page:String(p)})}`;
 return <AdminShell identity={identity} current="operations"><form className="flex gap-3 mb-6"><Input name="q" defaultValue={q} placeholder="جست‌وجوی عنوان یا نامک" aria-label="جست‌وجوی رکورد"/><Button variant="outline">جست‌وجو</Button></form><RecordConsole key={kind} kind={kind} records={records} references={{product,category,categorySlug:category.map(c=>({id:c.slug,name:c.name})),tag,article:article.map(a=>({id:a.id,name:a.title}))}}/><nav className="pagination" aria-label="صفحات رکوردها">{page>1&&<Link href={href(page-1)}>صفحه قبل</Link>}<span>صفحه {page.toLocaleString('fa-IR')} · {total.toLocaleString('fa-IR')} رکورد</span>{page*25<total&&<Link href={href(page+1)}>صفحه بعد</Link>}</nav></AdminShell>;
}
