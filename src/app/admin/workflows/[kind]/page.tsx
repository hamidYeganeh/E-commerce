import {Suspense} from "react";
import Link from "next/link";
import {notFound} from "next/navigation";
import {requirePageIdentity} from "@/modules/identity/request";
import type {PermissionKey} from "@/modules/identity/permissions";
import {getDatabase} from "@/infrastructure/database/server";
import {AdminShell} from "@/components/admin/admin-shell";
import {ActionForm,type ActionField} from "@/components/operations/action-form";
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from "@/components/ui/card";
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from "@/components/ui/table";
import {pageNumber} from "@/shared/pagination";
const sections:Record<string,{title:string;permission:PermissionKey}>={supply:{title:"تأمین، سری تولید و بهای خرید",permission:"inventory.write"},staff:{title:"همکاران و بازیابی حساب",permission:"staff.manage"},returns:{title:"درخواست‌های مرجوعی",permission:"orders.read"},reviews:{title:"نقد خریداران واقعی",permission:"catalog.write"},bundles:{title:"بسته‌های ترکیبی و هدیه",permission:"promotions.write"},seo:{title:"خزش فنی و ریدایرکت",permission:"catalog.read"}};
type Props={params:Promise<{kind:string}>;searchParams:Promise<{page?:string;q?:string}>};
export default function Page(props:Props){return <Suspense fallback={<p>در حال دریافت…</p>}><Content {...props}/></Suspense>;}
async function Content({params,searchParams}:Props){
 const kind=(await params).kind,section=sections[kind];if(!section)notFound();const identity=await requirePageIdentity(true,false,section.permission),db=getDatabase(),query=await searchParams,page=pageNumber(query.page),take=25,skip=(page-1)*take,endpoint=`/api/admin/workflows/${kind}`;
 const cards:React.ReactNode[]=[],rows:React.ReactNode[][]=[],form=(action:string,title:string,fields:ActionField[],defaults:Record<string,unknown>={},withKey=false)=>{cards.push(<Card key={`${action}-${cards.length}`}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><ActionForm endpoint={endpoint} action={action} title={title} fields={fields} defaults={defaults} withKey={withKey}/></CardContent></Card>);};let total=0;
 if(kind==="supply"){
  const [products,variants,suppliers,batches]=await Promise.all([db.product.findMany({select:{id:true,name:true},take:1000}),db.productVariant.findMany({include:{stock:true,product:{select:{name:true}}},take:1000}),db.supplier.findMany({orderBy:{name:"asc"}}),db.batch.findMany({include:{supplier:true,product:true},take,skip,orderBy:[{createdAt:"desc"},{id:"desc"}]})]);total=await db.batch.count();
  const variantOptions=variants.map(v=>({value:v.id,label:`${v.product.name} / ${v.name} / ${v.sku}`})),batchOptions=(await db.batch.findMany({include:{product:true},take:1000,orderBy:{createdAt:"desc"}})).map(b=>({value:b.id,label:`${b.product.name} / ${b.code}`}));
  form("supplier","ثبت تأمین‌کننده",[{name:"name",label:"نام",required:true},{name:"isActive",label:"فعال",type:"boolean",value:true}]);
  form("batch","ثبت سری تولید",[{name:"productId",label:"محصول",type:"select",required:true,options:products.map(p=>({value:p.id,label:p.name}))},{name:"code",label:"کد سری",required:true},{name:"supplierId",label:"تأمین‌کننده",type:"select",options:suppliers.filter(s=>s.isActive).map(s=>({value:s.id,label:s.name}))},{name:"origin",label:"مبدأ"},{name:"producedAt",label:"تاریخ تولید",type:"date"},{name:"expiresAt",label:"انقضا",type:"date"},{name:"labReportKey",label:"شناسهٔ مدرک آزمایش بارگذاری‌شده"}]);
  form("receive","ثبت رسید خرید",[{name:"variantId",label:"تنوع",type:"select",required:true,options:variantOptions},{name:"batchId",label:"سری",type:"select",required:true,options:batchOptions},{name:"quantity",label:"تعداد",type:"number",required:true},{name:"unitCostRial",label:"بهای خرید هر واحد (ریال)",required:true},{name:"reason",label:"توضیح رسید",required:true}],{},true);
  form("threshold","تنظیم آستانه و هدف تأمین",[{name:"variantId",label:"تنوع",type:"select",required:true,options:variantOptions},{name:"lowStockThreshold",label:"آستانه",type:"number",required:true},{name:"reorderTarget",label:"هدف موجودی",type:"number",required:true}]);
  for(const b of batches){const lots=await db.inventoryLot.findMany({where:{batchId:b.id}});const ids=lots.map(l=>l.id),trace=ids.length?await db.orderItemLot.findMany({where:{lotId:{in:ids}}}):[];rows.push([b.code,b.product.name,b.supplier?.name??"—",b.expiresAt?.toLocaleDateString("fa-IR")??"—",`مانده ${lots.reduce((s,l)=>s+l.remaining,0)} · فروش ${trace.reduce((s,l)=>s+l.quantity,0)}`,<span key={b.id}>{trace.map(t=><code key={`${t.orderItemId}-${t.lotId}`} className="block">{t.orderItemId} × {t.quantity}</code>)}</span>]);}
 }
 if(kind==="staff"){
  const roles=await db.role.findMany({orderBy:{key:"asc"}}),roleField:ActionField={name:"roleKey",label:"نقش و دسترسی",type:"select",required:true,options:roles.map(r=>({value:r.key,label:r.name}))};
  form("invite","دعوت همکار",[{name:"name",label:"نام",required:true},{name:"email",label:"ایمیل ورود",required:true},roleField]);
  const users=await db.user.findMany({where:{roles:{some:{}}},include:{roles:{include:{role:true}}},orderBy:{createdAt:"desc"},take,skip});total=await db.user.count({where:{roles:{some:{}}}});
  for(const u of users){rows.push([u.name,u.email,u.roles.map(r=>r.role.name).join("، "),u.disabledAt?"غیرفعال":u.twoFactorEnabled?"عامل دوم فعال":"نیازمند تنظیم عامل دوم"]);if(u.id!==identity.user.id){form("access",`دسترسی ${u.name}`,[{...roleField,value:u.roles[0]?.role.key},{name:"disabled",label:"حساب غیرفعال",type:"boolean",value:!!u.disabledAt}],{userId:u.id});form("recover",`بازیابی ${u.name}`,[{name:"confirmedIdentity",label:"هویت همکار را بررسی کرده‌ام",type:"boolean",required:true}],{userId:u.id});}}
 }
 if(kind==="returns"){
  total=await db.returnRequest.count();const requests=await db.returnRequest.findMany({include:{order:{select:{number:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],take,skip});for(const r of requests)rows.push([<Link key={r.id} href={`/admin/orders/${r.orderId}`}>سفارش #{r.order.number}</Link>,r.reason,r.status,r.createdAt.toLocaleDateString("fa-IR")]);
 }
 if(kind==="reviews"){
  total=await db.productReview.count();for(const r of await db.productReview.findMany({orderBy:{createdAt:"desc"},take,skip})){const p=await db.product.findUnique({where:{id:r.productId}});rows.push([p?.name??r.productId,r.rating,r.body,r.status]);form("moderate",`بررسی نقد ${p?.name??"محصول"}`,[{name:"status",label:"نتیجه",type:"select",required:true,options:[{value:"ACTIVE",label:"انتشار"},{value:"REJECTED",label:"رد"}]}],{id:r.id});}
 }
 if(kind==="bundles"){
  const variants=await db.productVariant.findMany({where:{isActive:true},include:{product:true},take:1000});
  form("save","ثبت بسته",[{name:"title",label:"نام بسته",required:true},{name:"slug",label:"نامک",required:true},{name:"priceRial",label:"قیمت بسته ریال",required:true},{name:"items",label:"اقلام بسته؛ حداقل دو تنوع",type:"items",options:variants.map(v=>({value:v.id,label:`${v.product.name} / ${v.name}`,max:20})),itemKey:"variantId"},{name:"active",label:"انتشار",type:"boolean"}]);total=await db.storeRecord.count({where:{kind:"bundle"}});for(const b of await db.storeRecord.findMany({where:{kind:"bundle"},take,skip,orderBy:{createdAt:"desc"}})){rows.push([b.title,b.status,<Link key={b.id} href="/bundles">نمایش بسته‌ها</Link>]);form("save",`بایگانی ${b.title}`,[],{id:b.id,title:b.title,slug:b.slug,version:b.version,...b.data as object,active:false});}
 }
 if(kind==="seo"){
  form("crawl","شروع خزش داخلی",[{name:"limit",label:"صفحه در هر نوبت (۱ تا ۵۰)",type:"number",value:20,required:true}]);
  const scan=await db.storeRecord.findFirst({where:{kind:"seo-scan"},orderBy:{updatedAt:"desc"}});if(scan){const data=scan.data as {pending:string[];rows:{path:string;status:number;issues:string[]}[]};for(const r of data.rows.slice(skip,skip+take))rows.push([r.path,r.status,r.issues.join("، ")||"موردی ثبت نشد"]);total=data.rows.length;if(data.pending.length)form("crawl",`ادامهٔ خزش (${data.pending.length} مسیر)`,[],{scanId:scan.id,limit:20});}
  if(identity.permissions.includes("settings.write")){form("redirect","ثبت یا ویرایش ریدایرکت",[{name:"source",label:"مسیر مبدأ /old",required:true},{name:"destination",label:"مسیر مقصد /new",required:true},{name:"permanent",label:"دائمی ۳۰۸",type:"boolean",value:true}]);for(const r of await db.redirectRule.findMany({take:100,orderBy:{source:"asc"}})){rows.push([r.source,r.destination,r.permanent?308:307]);form("deleteRedirect",`حذف ${r.source}`,[],{id:r.id});}}
 }
 return <AdminShell identity={identity} current="operations"><div className="flex min-w-0 flex-col gap-6"><Card><CardHeader><CardTitle>{section.title}</CardTitle><CardDescription>همهٔ تغییرات حساس همراه با مجوز و سابقه ثبت می‌شوند.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>اطلاعات</TableHead><TableHead>جزئیات</TableHead><TableHead>نتیجه</TableHead><TableHead>وضعیت</TableHead></TableRow></TableHeader><TableBody>{rows.map((row,i)=><TableRow key={i}>{row.map((cell,j)=><TableCell key={j}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table><nav className="pagination" aria-label="صفحات">{page>1&&<Link href={`?page=${page-1}`}>صفحه قبل</Link>}<span>صفحه {page.toLocaleString("fa-IR")}</span>{page*take<total&&<Link href={`?page=${page+1}`}>صفحه بعد</Link>}</nav></CardContent></Card><div className="grid items-start gap-6 lg:grid-cols-2">{cards}</div></div></AdminShell>;
}
