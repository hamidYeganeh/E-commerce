import {z} from "zod";
import type {PrismaClient} from "../../generated/prisma/client";
import {requirePermission} from "../identity/authorization";
import {DomainError} from "../../shared/domain-error";
const pathSchema=z.string().trim().max(1000).regex(/^\/(?!\/)/).refine(v=>!/[\\\s\u0000-\u001f?#]/.test(v)&&!/^\/(api|admin|account|staff)(\/|$)/.test(v));
export async function saveRedirect(db:PrismaClient,actorId:string,input:unknown){
 const d=z.discriminatedUnion("action",[z.object({action:z.literal("redirect"),source:pathSchema,destination:pathSchema,permanent:z.boolean().default(true)}),z.object({action:z.literal("deleteRedirect"),id:z.string()})]).parse(input);
 return db.$transaction(async tx=>{await requirePermission(tx,actorId,"settings.write");await tx.$executeRaw`SELECT pg_advisory_xact_lock(140019,44)`;if(d.action==="deleteRedirect"){await tx.redirectRule.delete({where:{id:d.id}});await tx.auditLog.create({data:{actorId,action:"redirect.delete",entityType:"RedirectRule",entityId:d.id}});return{saved:true};}
  let target=d.destination;const seen=new Set([d.source]);for(let i=0;i<100;i++){if(seen.has(target))throw new DomainError("REDIRECT_LOOP","حلقهٔ ریدایرکت مجاز نیست.");seen.add(target);const rule=await tx.redirectRule.findUnique({where:{source:target}});if(!rule)break;target=rule.destination;if(i===99)throw new DomainError("REDIRECT_CHAIN","زنجیرهٔ ریدایرکت طولانی است.");}
  const rule=await tx.redirectRule.upsert({where:{source:d.source},create:{source:d.source,destination:d.destination,permanent:d.permanent},update:{destination:d.destination,permanent:d.permanent,version:{increment:1}}});await tx.auditLog.create({data:{actorId,action:"redirect.save",entityType:"RedirectRule",entityId:rule.id}});return rule;
 });
}
export type CrawlRow={path:string;status:number;title:string;issues:string[];links:string[]};
export async function crawlSeo(db:PrismaClient,actorId:string,input:unknown,transport:typeof fetch=fetch){
 const d=z.object({scanId:z.string().max(100).optional(),limit:z.number().int().min(1).max(50).default(20)}).parse(input);
 await requirePermission(db,actorId,"catalog.read");
 const origin=new URL(process.env.NEXT_PUBLIC_SITE_URL??process.env.BETTER_AUTH_URL??"http://localhost:3000").origin;
 const prior=d.scanId?await db.storeRecord.findFirst({where:{id:d.scanId,kind:"seo-scan"}}):null;
 if(d.scanId&&!prior)throw new DomainError("NOT_FOUND","خزش پیدا نشد.");
 const saved=prior?.data as {pending:string[];rows:CrawlRow[]}|undefined;
 const [products,categories,tags]=await Promise.all([db.product.findMany({where:{status:"ACTIVE"},select:{slug:true}}),db.category.findMany({where:{isActive:true},select:{slug:true}}),db.tag.findMany({select:{slug:true}})]);
 const pending=saved?.pending??["/","/products","/about","/contact","/robots.txt","/sitemap.xml",...products.map(p=>`/products/${p.slug}`),...categories.map(p=>`/categories/${p.slug}`),...tags.map(p=>`/tags/${p.slug}`)],rows:CrawlRow[]=saved?.rows??[];
 const visited=new Set(rows.map(r=>r.path));
 for(let i=0;i<d.limit&&pending.length;i++){
  const path=pending.shift()!;if(visited.has(path)){i--;continue;}visited.add(path);const row:CrawlRow={path,status:0,title:"",issues:[],links:[]};
  try{
   const response=await transport(new URL(path,origin),{redirect:"manual",signal:AbortSignal.timeout(10000),cache:"no-store"});row.status=response.status;
   if(response.status>=300&&response.status<400){const location=response.headers.get("location");if(location){const target=new URL(location,origin);if(target.origin===origin&&pathSchema.safeParse(target.pathname).success&&!visited.has(target.pathname))pending.push(target.pathname);}row.issues.push("ریدایرکت؛ مقصد باید قابل دسترسی باشد");}
   if(response.status>=400)row.issues.push("پیوند خراب یا دسترسی ناموفق");
   const reader=response.body?.getReader();let size=0,html="";const decoder=new TextDecoder();if(reader)for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1500000){await reader.cancel();row.issues.push("صفحه بیش از ۱٫۵ مگابایت");break;}html+=decoder.decode(part.value,{stream:true});}
   if(response.headers.get("content-type")?.includes("text/html")){
    row.title=(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]??"").trim();
    if(!row.title)row.issues.push("عنوان ندارد");if(row.title.length>65)row.issues.push("عنوان طولانی");
    if(!/<meta\b(?=[^>]*name=["']description["'])(?=[^>]*content=["'][^"']+)[^>]*>/i.test(html))row.issues.push("متای توضیح ندارد");
    if(!/<link\b(?=[^>]*rel=["']canonical["'])(?=[^>]*href=["'][^"']+)[^>]*>/i.test(html))row.issues.push("canonical ندارد");
    if((html.match(/<h1\b/gi)??[]).length!==1)row.issues.push("تعداد H1 باید یک باشد");
    if(/<meta[^>]+content=["'][^"']*noindex/i.test(html)||response.headers.get("x-robots-tag")?.includes("noindex"))row.issues.push("noindex فعال است");
    for(const match of html.matchAll(/<(?:a|link|img)\b[^>]*\b(?:href|src)=["']([^"'#]+)["']/gi)){
     try{const url=new URL(match[1].replace(/&amp;/g,"&"),new URL(path,origin));if(url.origin!==origin||url.search||(!pathSchema.safeParse(url.pathname).success&&!/^\/api\/media\/[a-f0-9-]+\.(webp|jpg|png)$/.test(url.pathname))||/^\/_next\//.test(url.pathname))continue;row.links.push(url.pathname);if(!visited.has(url.pathname)&&!pending.includes(url.pathname)&&pending.length+rows.length<10000)pending.push(url.pathname);}catch{}
    }
   }
  }catch{row.issues.push("مهلت یا خطای اتصال");}
  rows.push(row);
 }
 const titles=new Map<string,string[]>();for(const r of rows)if(r.title)titles.set(r.title,[...(titles.get(r.title)??[]),r.path]);for(const r of rows)if((titles.get(r.title)?.length??0)>1&&!r.issues.includes("عنوان تکراری"))r.issues.push("عنوان تکراری");
 const record=prior?await db.storeRecord.update({where:{id:prior.id},data:{data:{pending,rows},version:{increment:1}}}):await db.storeRecord.create({data:{kind:"seo-scan",slug:crypto.randomUUID(),title:"خزش فنی داخلی",status:"ACTIVE",data:{pending,rows}}});
 return{id:record.id,scanned:rows.length,remaining:pending.length,message:`${rows.length} مسیر بررسی شد؛ ${pending.length} مسیر باقی است.`};
}
