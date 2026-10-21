import {recordSchemas} from "./contracts";
import {z} from "zod";
import {randomUUID,createHash} from "node:crypto";
import type {PrismaClient,Prisma} from "../../generated/prisma/client";
import {phoneSchema} from "../identity/input";
import {cartLinesSchema} from "../checkout/contracts";
import {getPublicProduct,productInclude,getLookups,visibleCategoryIds} from "../catalog/repository";
import {purchasePolicy} from "../catalog/purchase-policy";
import {DomainError} from "../../shared/domain-error";
export async function publicTarget(db:PrismaClient,type:string,id:string){
 if(type==="product"){const p=await db.product.findUnique({where:{id},select:{slug:true}});return !!p&&!!await getPublicProduct(db,p.slug);}
 if(type==="category")return visibleCategoryIds((await getLookups(db)).categories).includes(id);
 if(type==="tag")return !!await db.tag.findUnique({where:{id},select:{id:true}});
 if(type==="article")return !!await db.storeRecord.findFirst({where:{id,kind:"article",status:"ACTIVE"},select:{id:true}});
 return false;
}
export async function captureLead(db:PrismaClient,input:unknown){
 const d=z.object({name:z.string().trim().min(2).max(100),phone:phoneSchema,sourceType:z.enum(["product","category","tag"]),sourceId:z.string().min(1).max(100),message:z.string().trim().max(1000).default(""),marketingConsent:z.boolean().default(false)}).parse(input);
 if(!await publicTarget(db,d.sourceType,d.sourceId))throw new DomainError("NOT_FOUND","صفحه پیدا نشد.");
 await db.lead.create({data:d});return{accepted:true};
}
export async function requestRestock(db:PrismaClient,userId:string,variantId:string){
 const user=await db.user.findFirst({where:{id:userId,disabledAt:null,phoneNumberVerified:true}});if(!user?.phoneNumber)throw new DomainError("VERIFIED_PHONE_REQUIRED","با شمارهٔ تأییدشده وارد شوید.");
 const v=await db.productVariant.findUnique({where:{id:variantId},include:{stock:true,product:{include:productInclude}}});
 const policy=purchasePolicy(visibleCategoryIds((await getLookups(db)).categories));
 if(!policy.allowsVariant(v))throw new DomainError("NOT_FOUND","محصول پیدا نشد.");
 if(v.stock&&v.stock.onHand>v.stock.reserved)throw new DomainError("ALREADY_AVAILABLE","این تنوع همین حالا قابل خرید است.");
 const old=await db.restockRequest.findUnique({where:{variantId_userId:{variantId,userId}}});if(old?.sentAt)return db.restockRequest.update({where:{id:old.id},data:{sentAt:null,createdAt:new Date()}});return db.restockRequest.upsert({where:{variantId_userId:{variantId,userId}},update:{},create:{variantId,userId}});
}
export async function submitCommunity(db:PrismaClient,userId:string,input:unknown){
 const d=z.object({kind:z.enum(["question","comment"]),targetType:z.enum(["product","tag","article","order"]),targetId:z.string().min(1).max(100),body:z.string().trim().min(5).max(3000),rating:z.number().int().min(1).max(5).default(5),answers:z.array(z.object({question:z.string().max(200),rating:z.number().int().min(1).max(5)})).max(20).default([])}).parse(input);
 const user=await db.user.findFirst({where:{id:userId,disabledAt:null,phoneNumberVerified:true},select:{name:true}});if(!user)throw new DomainError("FORBIDDEN","ورود با موبایل تأییدشده لازم است.");
 if(d.targetType==="order"){if(d.kind!=="comment"||!await db.order.count({where:{id:d.targetId,userId,status:"COMPLETED"}}))throw new DomainError("FORBIDDEN","امتیاز فقط برای سفارش تحویل‌شدهٔ خودتان مجاز است.");}
 else if(!await publicTarget(db,d.targetType,d.targetId))throw new DomainError("NOT_FOUND","صفحه پیدا نشد.");
 if(d.targetType==="order"){const s=await db.storeRecord.findUnique({where:{kind_slug:{kind:"settings",slug:"shop"}}}),questions=s?.status==="ACTIVE"?recordSchemas.settings.parse(s.data).ratingQuestions.split("\n").map(v=>v.trim()).filter(Boolean).slice(0,20):[];if(d.answers.some(a=>!questions.includes(a.question))||new Set(d.answers.map(a=>a.question)).size!==d.answers.length||questions.length!==d.answers.length)throw new DomainError("RATING_CHANGED","سؤال‌های ارزیابی تغییر کرده‌اند؛ صفحه را تازه کنید.");}else if(d.answers.length)throw new DomainError("INVALID_INPUT","ارزیابی پرسش فقط برای سفارش است.");
 if(d.kind==="question"&&!["product","tag"].includes(d.targetType))throw new DomainError("INVALID_INPUT","مقصد پرسش معتبر نیست.");
 if(d.kind==="comment"&&d.targetType==="product")throw new DomainError("INVALID_INPUT","برای این محصول پرسش ثبت کنید.");
 await db.storeRecord.create({data:{kind:d.kind,slug:randomUUID(),title:d.body.slice(0,100),status:"DRAFT",data:d.kind==="question"?{targetType:d.targetType,targetId:d.targetId,question:d.body,answer:"",name:user.name}:{targetType:d.targetType,targetId:d.targetId,body:d.body,name:user.name,rating:d.rating,answers:d.answers}}});return{accepted:true};
}
export async function saveCart(db:PrismaClient,userId:string,input:unknown){
 const d=z.object({lines:z.union([z.tuple([]),cartLinesSchema]),marketingConsent:z.boolean().optional(),expectedActivityVersion:z.number().int().min(0).nullable().optional(),mutationKey:z.uuid().optional(),expectedOwner:z.string().min(1).max(100).optional()}).refine(d=>!d.mutationKey||d.expectedActivityVersion!==undefined,"A cart mutation requires its expected version").parse(input);
 if(d.expectedOwner!==undefined&&d.expectedOwner!==userId)throw new DomainError("FORBIDDEN","مالک سبد تغییر کرده است؛ دوباره وارد شوید.");
 const payloadHash=createHash("sha256").update(JSON.stringify({lines:[...d.lines].sort((a,b)=>a.variantId.localeCompare(b.variantId)),expectedActivityVersion:d.expectedActivityVersion??null,marketingConsent:d.marketingConsent??null})).digest("hex");
 return db.$transaction(async tx=>{
  const user=await tx.user.findFirst({where:{id:userId,disabledAt:null}});if(!user)throw new DomainError("FORBIDDEN","ورود لازم است.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId},34))`;
  if(d.mutationKey){
   const receipt=await tx.cartWriteReceipt.findUnique({where:{userId_key:{userId,key:d.mutationKey}}});
   if(receipt){if(receipt.payloadHash!==payloadHash)throw new DomainError("CART_WRITE_CONFLICT","شناسهٔ ذخیرهٔ سبد با اطلاعات دیگری استفاده شده است.");return{saved:true,activityVersion:receipt.activityVersion};}
  }
  if(await tx.productVariant.count({where:{id:{in:d.lines.map(l=>l.variantId)}}})!==d.lines.length)throw new DomainError("INVALID_REFERENCE","تنوع کالا معتبر نیست.");
  const old=await tx.cart.findFirst({where:{userId},include:{items:true}});
  if(d.expectedActivityVersion!==undefined&&d.expectedActivityVersion!==(old?.activityVersion??null))throw new DomainError("CART_VERSION_CONFLICT","سبد خرید تغییر کرده است؛ دوباره بررسی کنید.");
  const cart=old??await tx.cart.create({data:{userId}});
  const equal=old&&old.items.length===d.lines.length&&old.items.every(i=>d.lines.some(l=>l.variantId===i.variantId&&l.quantity===i.quantity));
  if(!equal){
  await tx.cartItem.deleteMany({where:{cartId:cart.id}});
  if(d.lines.length)await tx.cartItem.createMany({data:d.lines.map(l=>({...l,cartId:cart.id}))});
  await tx.cart.update({where:{id:cart.id},data:{activityVersion:{increment:1}}});
  }
  if(d.marketingConsent!==undefined)await tx.customerPreference.upsert({where:{userId},create:{userId,marketingConsent:d.marketingConsent},update:{marketingConsent:d.marketingConsent}});
  const activityVersion=equal?cart.activityVersion:cart.activityVersion+1;
  if(d.mutationKey)await tx.cartWriteReceipt.create({data:{userId,key:d.mutationKey,payloadHash,activityVersion}});
  return{saved:true,activityVersion};
 });
}

// A receipt is scoped by the authenticated owner; another customer's key has no result.
export async function ownedCartWriteReceipt(db:PrismaClient|Prisma.TransactionClient,userId:string,key:string){
 const mutationKey=z.uuid().parse(key);
 return db.cartWriteReceipt.findUnique({where:{userId_key:{userId,key:mutationKey}},select:{key:true,activityVersion:true}});
}
