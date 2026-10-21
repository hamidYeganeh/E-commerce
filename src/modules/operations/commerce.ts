import { z } from "zod";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { DomainError } from "../../shared/domain-error";
import { requirePermission } from "../identity/authorization";
import { ids, recordSchemas } from "./contracts";
const clean=(v:string)=>v.trim().replace(/ي/g,"ی").replace(/ك/g,"ک").replace(/\s+/g," ");
export async function shippingOptions(tx: Prisma.TransactionClient, address: {province:string;city:string}, subtotal: bigint, lines:{quantity:number;shippingWeightGrams:number|null;netWeightGrams:number|null}[]) {
  const methods=await tx.storeRecord.findMany({where:{kind:"shipping",status:"ACTIVE"},orderBy:{title:"asc"}});
  const weight=lines.reduce((n,l)=>n+BigInt(l.shippingWeightGrams??l.netWeightGrams??0)*BigInt(l.quantity),0n);
  return methods.flatMap(m=>{
    const d=recordSchemas.shipping.parse(m.data), provinces=ids(d.provinces).map(clean), cities=ids(d.cities).map(clean);
    if((provinces.length&&!provinces.includes(clean(address.province))) || (cities.length&&!cities.includes(clean(address.city))) || subtotal<BigInt(d.minimumRial) || (d.maxWeightGrams&&weight>BigInt(d.maxWeightGrams)))return [];
    // A fixed/percentage fee can still have a weight cap. Unknown weight cannot
    // establish eligibility for that method, even when delivery would be free.
    if((d.mode==="WEIGHT" || d.maxWeightGrams>0) && lines.some(l=>!l.shippingWeightGrams&&!l.netWeightGrams))return [];
    const fee=BigInt(d.freeAboveRial)>0n&&subtotal>=BigInt(d.freeAboveRial)?0n:BigInt(d.baseRial)+(d.mode==="WEIGHT"?((weight+999n)/1000n)*BigInt(d.perKgRial):d.mode==="PERCENT"?(subtotal*BigInt(d.percentage)+99n)/100n:0n);
    return [{id:m.id,name:m.title,feeRial:fee.toString(),deliveryDays:d.deliveryDays}];
  });
}
export async function resolveShipping(tx:Prisma.TransactionClient, id:string|undefined, address:{province:string;city:string},subtotal:bigint,lines:{quantity:number;shippingWeightGrams:number|null;netWeightGrams:number|null}[],fallback:bigint) {
  const configured=await tx.storeRecord.count({where:{kind:"shipping",status:"ACTIVE"}});
  if(!configured&&!id)return {fee:fallback,name:"ارسال فروشگاه"};
  const found=(await shippingOptions(tx,address,subtotal,lines)).find(m=>m.id===id);
  if(!found)throw new DomainError("SHIPPING_UNAVAILABLE","روش ارسال معتبر برای نشانی و اقلام انتخاب کنید.");
  return {fee:BigInt(found.feeRial),name:found.name};
}
export const couponSchema=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/),type:z.enum(["PERCENTAGE","FIXED"]),percentage:z.coerce.number().int().min(0).max(100).default(0),amountRial:z.string().regex(/^\d{1,15}$/),minimumRial:z.string().regex(/^\d{1,15}$/).default("0"),maxDiscountRial:z.string().regex(/^\d{1,15}$/).default("0"),usageLimit:z.coerce.number().int().min(0).max(10000000).default(0),perUserLimit:z.coerce.number().int().min(1).max(100000).default(1),startsAt:z.iso.datetime(),expiresAt:z.iso.datetime(),isActive:z.boolean(),firstPurchaseOnly:z.boolean().default(false),productIds:z.union([z.string().transform(ids),z.array(z.string())]).default([]),categoryIds:z.union([z.string().transform(ids),z.array(z.string())]).default([]),customerIds:z.union([z.string().transform(ids),z.array(z.string())]).default([]),version:z.number().int().min(0).default(0)}).refine(d=>new Date(d.startsAt)<new Date(d.expiresAt) && (d.type==="FIXED"?BigInt(d.amountRial)>0n:d.percentage>0));
export async function saveCoupon(db:PrismaClient,actorId:string,id:string|undefined,input:unknown){
 const d=couponSchema.parse(input);
 return db.$transaction(async tx=>{
  await requirePermission(tx,actorId,"promotions.write");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('coupon',32))`;
  const old=id?await tx.coupon.findUnique({where:{id}}):null;
  if(id&&!old)throw new DomainError("NOT_FOUND","کد پیدا نشد.");
  if(old&&old.version!==d.version)throw new DomainError("VERSION_CONFLICT","کد تغییر کرده است.");
  const data={firstPurchaseOnly:d.firstPurchaseOnly,productIds:d.productIds,categoryIds:d.categoryIds,customerIds:d.customerIds,code:d.code,type:d.type,percentage:d.type==="PERCENTAGE"?d.percentage:null,amountRial:d.type==="FIXED"?BigInt(d.amountRial):null,minimumRial:BigInt(d.minimumRial),maxDiscountRial:BigInt(d.maxDiscountRial)||null,usageLimit:d.usageLimit||null,perUserLimit:d.perUserLimit,startsAt:new Date(d.startsAt),expiresAt:new Date(d.expiresAt),isActive:d.isActive};
  const saved=old?await tx.coupon.update({where:{id:old.id},data:{...data,version:{increment:1}}}):await tx.coupon.create({data});
  await tx.auditLog.create({data:{actorId,entityType:"Coupon",entityId:saved.id,action:"coupon.save"}});return saved;
 });
}
export async function couponDiscount(tx:Prisma.TransactionClient,userId:string,code:string|undefined,subtotal:bigint,lock=false,lines?:{variantId:string;totalRial:bigint}[]){
 if(!code)return {discount:0n,couponId:null,eligibleIds:lines?.map(l=>l.variantId)??[]};
 const normalized=code.trim().toUpperCase();
 if(lock)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('coupon',32))`;
 const coupon=await tx.coupon.findUnique({where:{code:normalized}}),now=new Date();
 if(!coupon||!coupon.isActive||coupon.startsAt>now||coupon.expiresAt<=now||subtotal<coupon.minimumRial)throw new DomainError("INVALID_COUPON","کد تخفیف برای این سفارش معتبر نیست.");
 if((coupon.customerIds.length&&!coupon.customerIds.includes(userId))||(coupon.firstPurchaseOnly&&await tx.order.count({where:{userId,payments:{some:{status:"SUCCEEDED"}}}})))throw new DomainError("INVALID_COUPON","این کد برای حساب شما قابل استفاده نیست.");
 let eligibleIds=lines?.map(l=>l.variantId)??[],eligibleSubtotal=subtotal;
 if(coupon.productIds.length||coupon.categoryIds.length){
  const variants=await tx.productVariant.findMany({where:{id:{in:eligibleIds},OR:[...(coupon.productIds.length?[{productId:{in:coupon.productIds}}]:[]),...(coupon.categoryIds.length?[{product:{categories:{some:{categoryId:{in:coupon.categoryIds}}}}}]:[])]}});
  eligibleIds=variants.map(v=>v.id);eligibleSubtotal=(lines??[]).filter(l=>eligibleIds.includes(l.variantId)).reduce((s,l)=>s+l.totalRial,0n);
  if(!eligibleSubtotal)throw new DomainError("INVALID_COUPON","اقلام واجد شرایط تخفیف در سبد نیستند.");
 }
 const where={couponId:coupon.id,status:{in:["RESERVED","CONSUMED"] as ("RESERVED"|"CONSUMED")[]}};
 const total=await tx.couponRedemption.count({where}),personal=await tx.couponRedemption.count({where:{...where,order:{userId}}});
 if((coupon.usageLimit!==null&&total>=coupon.usageLimit)||personal>=coupon.perUserLimit)throw new DomainError("COUPON_LIMIT","سقف مصرف کد تخفیف تکمیل شده است.");
 let discount=coupon.type==="FIXED"?coupon.amountRial!:eligibleSubtotal*BigInt(coupon.percentage!)/100n;
 if(coupon.maxDiscountRial!==null&&discount>coupon.maxDiscountRial)discount=coupon.maxDiscountRial;
 if(discount>eligibleSubtotal)discount=eligibleSubtotal;
 return {discount,couponId:coupon.id,eligibleIds};
}
