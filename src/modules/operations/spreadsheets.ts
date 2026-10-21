import ExcelJS from "exceljs";
import {createHmac,timingSafeEqual} from "node:crypto";
import {inflateRawSync} from "node:zlib";
import {z} from "zod";
import type {PrismaClient} from "../../generated/prisma/client";
import {requirePermission} from "../identity/authorization";
import {authEnv} from "../../config/env";
import {DomainError} from "../../shared/domain-error";
import {getLookups,productInclude,productToInput} from "../catalog/repository";
import {validateProduct} from "../catalog/rules";
import {priceRialSchema} from "../catalog/contracts";
import {customerSearchWhere} from "./customer-search";
const rowSchema=z.object({id:z.string().min(1).max(100),sku:z.string().max(100),version:z.number().int().min(0),oldPrice:priceRialSchema,newPrice:priceRialSchema});
const previewSchema=z.object({actor:z.string(),expires:z.number(),rows:z.array(rowSchema).min(1).max(1000)});
function signature(body:string){return createHmac("sha256",authEnv().BETTER_AUTH_SECRET).update(`price-import:${body}`).digest("base64url");}
// Limit expanded ZIP sizes before ExcelJS parses XML or allocates shared strings.
export function validateWorkbookZip(buffer:Buffer){
 if(buffer.length>2*1024*1024||buffer.length<22)throw new DomainError("INVALID_FILE","فایل باید xlsx و کوچک‌تر از ۲ مگابایت باشد.");
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new DomainError("INVALID_FILE","فایل اکسل معتبر نیست.");
 const count=buffer.readUInt16LE(end+10),offset=buffer.readUInt32LE(end+16);if(buffer.readUInt16LE(end+8)!==count||buffer.readUInt32LE(end+12)!==end-offset||end+22+buffer.readUInt16LE(end+20)!==buffer.length||count>2000||buffer.readUInt16LE(end+4)!==0||buffer.readUInt16LE(end+6)!==0)throw new DomainError("INVALID_FILE","فایل اکسل بیش از حد بزرگ است.");
 const names=new Set<string>();let cursor=offset,total=0;for(let i=0;i<count;i++){
  if(cursor+46>end||buffer.readUInt32LE(cursor)!==0x02014b50)throw new DomainError("INVALID_FILE","ساختار فایل معتبر نیست.");
  const declared=buffer.readUInt32LE(cursor+24),packed=buffer.readUInt32LE(cursor+20),method=buffer.readUInt16LE(cursor+10),flags=buffer.readUInt16LE(cursor+8),local=buffer.readUInt32LE(cursor+42),nameLength=buffer.readUInt16LE(cursor+28),extra=buffer.readUInt16LE(cursor+30),comment=buffer.readUInt16LE(cursor+32);
  if(local+30>offset||buffer.readUInt32LE(local)!==0x04034b50||flags&1||![0,8].includes(method)||declared>20*1024*1024-total)throw new DomainError("INVALID_FILE","ساختار فشرده‌سازی فایل مجاز نیست.");
  const centralName=buffer.subarray(cursor+46,cursor+46+nameLength).toString("utf8"),localLength=buffer.readUInt16LE(local+26),localName=buffer.subarray(local+30,local+30+localLength).toString("utf8");if(names.has(centralName)||centralName!==localName||buffer.readUInt16LE(local+8)!==method||buffer.readUInt16LE(local+6)!==flags||centralName.split("/").includes("..")||centralName.startsWith("/"))throw new DomainError("INVALID_FILE","ساختار فشرده‌سازی فایل مجاز نیست.");names.add(centralName);
  const start=local+30+localLength+buffer.readUInt16LE(local+28);if(start+packed>offset)throw new DomainError("INVALID_FILE","ساختار فایل معتبر نیست.");
  try{const expanded=method===0?buffer.subarray(start,start+packed):inflateRawSync(buffer.subarray(start,start+packed),{maxOutputLength:20*1024*1024-total});total+=expanded.length;if(expanded.length!==declared||total>20*1024*1024||/<!DOCTYPE/i.test(expanded.toString("utf8")))throw new Error();}catch{throw new DomainError("INVALID_FILE","حجم یا ساختار بازشدهٔ فایل مجاز نیست.");}
  cursor+=46+nameLength+extra+comment;
 }
 if(cursor!==end)throw new DomainError("INVALID_FILE","ساختار فایل معتبر نیست.");
}
export async function exportWorkbook(db:PrismaClient,actor:string,kind:"prices"|"customers",q="",page=1){
 await requirePermission(db,actor,kind==="prices"?"catalog.write":"customers.read");
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet(kind);sheet.views=[{rightToLeft:true}];
 if(kind==="prices"){sheet.columns=[{header:"variantId",key:"id",width:32},{header:"sku",key:"sku",width:24},{header:"version",key:"version",width:12},{header:"priceRial",key:"priceRial",width:24},{header:"product",key:"product",width:35}];const rows=await db.productVariant.findMany({where:q?{OR:[{sku:{contains:q,mode:"insensitive"}},{product:{name:{contains:q,mode:"insensitive"}}}]}:{},orderBy:{id:"asc"},take:1000,skip:(page-1)*1000,include:{product:{select:{name:true}}}});for(const r of rows)sheet.addRow({id:r.id,sku:r.sku,version:r.version,priceRial:r.priceRial.toString(),product:r.product.name});}
 else {sheet.columns=[{header:"شناسه",key:"id",width:32},{header:"نام",key:"name",width:30},{header:"موبایل",key:"phone",width:22},{header:"ثبت‌نام",key:"created",width:25},{header:"آخرین خرید",key:"last",width:25}];const rows=await db.user.findMany({where:customerSearchWhere(q),take:10000,skip:(page-1)*10000,orderBy:{id:"asc"},select:{id:true,name:true,phoneNumber:true,createdAt:true,orders:{where:{payments:{some:{status:"SUCCEEDED"}}},orderBy:{confirmedAt:"desc"},take:1,select:{confirmedAt:true}}}});for(const r of rows)sheet.addRow({id:r.id,name:r.name,phone:r.phoneNumber??"",created:r.createdAt.toISOString(),last:r.orders[0]?.confirmedAt?.toISOString()??""});}
 sheet.getRow(1).font={bold:true};sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:sheet.columnCount}};await db.auditLog.create({data:{actorId:actor,entityType:"Export",entityId:kind,action:`${kind}.export`}});return Buffer.from(await book.xlsx.writeBuffer());
}
export async function previewPrices(db:PrismaClient,actor:string,file:Buffer){
 await requirePermission(db,actor,"catalog.write");validateWorkbookZip(file);const book=new ExcelJS.Workbook();await book.xlsx.load(file as unknown as ExcelJS.Buffer);const sheet=book.worksheets[0];if(!sheet||sheet.rowCount>1001||sheet.columnCount>12)throw new DomainError("INVALID_FILE","حداکثر ۱۰۰۰ ردیف و ۱۲ ستون مجاز است.");
 const cell=(r:number,c:number)=>{const value=sheet.getCell(r,c).value;if((typeof value!=="string"&&typeof value!=="number")||(typeof value==="number"&&!Number.isSafeInteger(value)))throw new DomainError("INVALID_FILE","فرمول، پیوند، سلول ترکیبی و عدد غیرصحیح یا غیردقیق مجاز نیست؛ مبالغ بزرگ را به صورت متن وارد کنید.");return String(value).trim();};
 if(["variantId","sku","version","priceRial"].some((v,i)=>cell(1,i+1)!==v))throw new DomainError("INVALID_FILE","عنوان و ترتیب ستون‌های قالب را تغییر ندهید.");
 const raw=[];for(let i=2;i<=sheet.rowCount;i++){if(!sheet.getRow(i).hasValues)continue;const id=cell(i,1),sku=cell(i,2),version=Number(cell(i,3)),newPrice=cell(i,4);raw.push({id,sku,version,newPrice});}
 if(!raw.length||new Set(raw.map(r=>r.id)).size!==raw.length)throw new DomainError("INVALID_FILE","ردیف خالی یا شناسهٔ تکراری وجود دارد.");
 const existing=await db.productVariant.findMany({where:{id:{in:raw.map(r=>r.id)}},select:{id:true,sku:true,version:true,priceRial:true,isActive:true}});
 const rows=raw.map(r=>{const old=existing.find(v=>v.id===r.id);if(!old||old.sku!==r.sku||old.version!==r.version)throw new DomainError("VERSION_CONFLICT","قالب قدیمی است یا کد تنوع تغییر کرده؛ خروجی تازه بگیرید.");const row=rowSchema.parse({...r,oldPrice:old.priceRial.toString()});if(old.isActive&&BigInt(row.newPrice)<=0n)throw new DomainError("INVALID_PRICE","قیمت تنوع فعال باید مثبت باشد.");return row;}).filter(r=>r.oldPrice!==r.newPrice);
 if(!rows.length)throw new DomainError("NO_CHANGES","قیمتی تغییر نکرده است.");const body=Buffer.from(JSON.stringify({actor,expires:Date.now()+600000,rows})).toString("base64url");return{rows,token:`${body}.${signature(body)}`};
}
export async function applyPrices(db:PrismaClient,actor:string,token:string){
 if(token.length>500000)throw new DomainError("INVALID_INPUT","پیش‌نمایش معتبر نیست.");const [body,sig,...extra]=token.split("."),expected=signature(body??"");if(extra.length||!sig||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw new DomainError("INVALID_INPUT","پیش‌نمایش معتبر نیست.");
 const d=previewSchema.parse(JSON.parse(Buffer.from(body,"base64url").toString()));if(d.actor!==actor||d.expires<Date.now())throw new DomainError("PREVIEW_EXPIRED","پیش‌نمایش منقضی شده است؛ فایل را دوباره بررسی کنید.");
 return db.$transaction(async tx=>{await requirePermission(tx,actor,"catalog.write");await tx.$executeRaw`SELECT pg_advisory_xact_lock(140017,1)`;const products=new Set<string>();for(const r of d.rows){const v=await tx.productVariant.findUnique({where:{id:r.id}});if(!v||v.version!==r.version||v.priceRial.toString()!==r.oldPrice||v.sku!==r.sku)throw new DomainError("VERSION_CONFLICT","قیمت یا تنوع تغییر کرده؛ هیچ ردیفی اعمال نشد.");if(v.isActive&&BigInt(r.newPrice)<=0n)throw new DomainError("INVALID_PRICE","قیمت فعال باید مثبت باشد.");await tx.productVariant.update({where:{id:v.id},data:{priceRial:BigInt(r.newPrice),version:{increment:1}}});products.add(v.productId);}await tx.product.updateMany({where:{id:{in:[...products]}},data:{version:{increment:1}}});await tx.auditLog.create({data:{actorId:actor,entityType:"ProductVariant",entityId:d.rows[0].id,action:"price.import",changes:{rows:d.rows}}});return{updated:d.rows.length};},{timeout:30000});
}
export async function bulkProducts(db:PrismaClient,actor:string,input:unknown){
 const d=z.object({products:z.array(z.object({id:z.string().max(100),version:z.number().int().min(0)})).min(1).max(100),status:z.enum(["DRAFT","ACTIVE","ARCHIVED"]).optional(),brandId:z.string().nullable().optional(),categoryId:z.string().optional()}).refine(d=>d.status!==undefined||d.brandId!==undefined||!!d.categoryId).parse(input);
 return db.$transaction(async tx=>{await requirePermission(tx,actor,"catalog.write");await tx.$executeRaw`SELECT pg_advisory_xact_lock(140017,1)`;const lookups=await getLookups(tx);if(d.brandId&&!lookups.brands.some(b=>b.id===d.brandId)||d.categoryId&&!lookups.categories.some(c=>c.id===d.categoryId))throw new DomainError("INVALID_REFERENCE","برند یا گروه معتبر نیست.");for(const p of d.products){const product=await tx.product.findUnique({where:{id:p.id},include:productInclude});if(!product||product.version!==p.version)throw new DomainError("VERSION_CONFLICT","محصول تغییر کرده است؛ هیچ تغییری اعمال نشد.");const next=productToInput(product);if(d.status)next.status=d.status;if(d.brandId!==undefined)next.brandId=d.brandId;if(d.categoryId){next.categoryIds=[...new Set([...next.categoryIds,d.categoryId])];next.primaryCategoryId??=d.categoryId;}validateProduct(next,lookups.categories,lookups.attributes,lookups.categories.flatMap(c=>c.attributes));await tx.product.update({where:{id:p.id},data:{status:next.status,brandId:next.brandId,version:{increment:1}}});if(d.categoryId)await tx.productCategory.upsert({where:{productId_categoryId:{productId:p.id,categoryId:d.categoryId}},create:{productId:p.id,categoryId:d.categoryId,isPrimary:next.primaryCategoryId===d.categoryId},update:{isPrimary:next.primaryCategoryId===d.categoryId}});}await tx.auditLog.create({data:{actorId:actor,entityType:"Product",entityId:d.products[0].id,action:"product.bulk",changes:d}});return{updated:d.products.length};},{timeout:30000});
}
