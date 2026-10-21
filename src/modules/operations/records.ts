import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { requirePermission } from "../identity/authorization";
import { DomainError } from "../../shared/domain-error";
import { recordSchemas, recordInput, ids, publicUrl,type RecordKind } from "./contracts";
import type { PermissionKey } from "../identity/permissions";
export const recordPermissions: Record<RecordKind, PermissionKey> = {
  bundle:"promotions.write",article:"catalog.write", page:"settings.write", faq:"catalog.write", question:"catalog.write", comment:"catalog.write", product:"catalog.write", shipping:"settings.write", banner:"settings.write", settings:"settings.write", notification:"settings.write", integration:"settings.write", gateway:"settings.write",
};
export function recordKind(value: string): RecordKind { if (!Object.hasOwn(recordSchemas,value)) throw new DomainError("NOT_FOUND","بخش پیدا نشد."); return value as RecordKind; }
export async function listRecords(db: PrismaClient, actorId: string, kind: RecordKind,q="",page=1) {
  await requirePermission(db,actorId,recordPermissions[kind]);
  const where={kind,...(q?{OR:[{title:{contains:q,mode:"insensitive" as const}},{slug:{contains:q,mode:"insensitive" as const}}]}:{})};const [total,records]=await db.$transaction([db.storeRecord.count({where}),db.storeRecord.findMany({where,orderBy:[{updatedAt:"desc"},{id:"desc"}],take:25,skip:(page-1)*25})]);return{total,records};
}
export async function saveRecord(db: PrismaClient, actorId: string, kind: RecordKind, input: unknown) {
  const parsed=recordInput.parse(input), data=recordSchemas[kind].parse(parsed.data);
  return db.$transaction(async tx=>{
    await requirePermission(tx,actorId,recordPermissions[kind]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${kind},31))`;
    const previous=parsed.id?await tx.storeRecord.findFirst({where:{id:parsed.id,kind}}):null;
    if(parsed.id && !previous) throw new DomainError("NOT_FOUND","رکورد پیدا نشد.");
    if(previous && previous.version!==parsed.version) throw new DomainError("VERSION_CONFLICT","اطلاعات تغییر کرده است؛ صفحه را تازه کنید.");
    if(previous&&kind==="gateway"&&await tx.paymentAttempt.count({where:{provider:`zarinpal:${previous.id}`}})){
      const old=recordSchemas.gateway.parse(previous.data),next=recordSchemas.gateway.parse(data);
      if(old.merchantEnv!==next.merchantEnv||old.sandbox!==next.sandbox)throw new DomainError("GATEWAY_IN_USE","این درگاه سابقهٔ پرداخت دارد؛ برای تغییر حساب یا محیط، درگاه جدید بسازید.");
    }
    if(kind==="notification"){
      const topic=recordSchemas.notification.parse(data).topic;
      if(await tx.storeRecord.count({where:{kind,status:"ACTIVE",...(previous?{id:{not:previous.id}}:{}),data:{path:["topic"],equals:topic}}})&&parsed.status==="ACTIVE")throw new DomainError("DUPLICATE","برای هر رویداد فقط یک قاعدهٔ فعال مجاز است.");
    }
    if(kind==="bundle"){
      const bundle=recordSchemas.bundle.parse(data);
      if(await tx.productVariant.count({where:{id:{in:bundle.items.map(i=>i.variantId)},isActive:true}})!==bundle.items.length)throw new DomainError("INVALID_REFERENCE","اقلام بسته باید تنوع‌های فعال باشند.");
    }
    if(kind==="settings" && parsed.slug!=="shop") throw new DomainError("INVALID_SETTINGS","نامک تنظیمات باید shop باشد.");
    if(kind==="settings"){
      const settings=recordSchemas.settings.parse(data),questions=settings.ratingQuestions.split("\n").map(s=>s.trim()).filter(Boolean);
      if(questions.length>20||questions.some(q=>q.length>200)||new Set(questions).size!==questions.length)throw new DomainError("INVALID_SETTINGS","حداکثر ۲۰ سؤال ارزیابی یکتا و کوتاه‌تر از ۲۰۰ نویسه وارد کنید.");
      const menu=settings.menuLinks.split("\n").map(s=>s.trim()).filter(Boolean);
      if(menu.length>8||menu.some(line=>{const [title,href,...extra]=line.split("|").map(s=>s.trim());return !title||!href||extra.length>0||!publicUrl.safeParse(href).success;}))throw new DomainError("INVALID_SETTINGS","هر خط منو باید «عنوان | /مسیر» باشد؛ حداکثر ۸ پیوند مجاز است.");
      const rows=settings.homeRows.split("\n").map(s=>s.trim()).filter(Boolean);if(rows.length>10||await tx.category.count({where:{slug:{in:[...new Set(rows)]}}})!==new Set(rows).size)throw new DomainError("INVALID_SETTINGS","نامک حداکثر ۱۰ گروه موجود را برای ردیف‌های صفحه نخست وارد کنید.");
    }
    if(kind==="notification"){const d=recordSchemas.notification.parse(data);if(parsed.status==="ACTIVE"&&d.enabled&&!d.template.trim())throw new DomainError("PUBLICATION_INCOMPLETE","برای ارسال فعال، متن پیامک لازم است.");}
    if(kind==="banner"){const d=recordSchemas.banner.parse(data);if(d.categoryId&&!await tx.category.count({where:{id:d.categoryId}}))throw new DomainError("INVALID_REFERENCE","گروه بنر پیدا نشد.");}
    if(kind==="integration"){const d=recordSchemas.integration.parse(data);if(d.enabled&&!["kavenegar","mellipayamak","torob","goftino"].includes(d.provider))throw new DomainError("PROVIDER_NOT_READY","این سرویس به حساب فعال و بررسی مستندات پنل نیاز دارد و فعلاً قابل فعال‌سازی نیست.");}
    if(kind==="product" && !await tx.product.count({where:{id:parsed.slug}})) throw new DomainError("INVALID_REFERENCE","نامک این بخش باید شناسهٔ محصول باشد.");
    if("targetType" in data && "targetId" in data) {
      const target=data.targetType==="product"?await tx.product.count({where:{id:data.targetId}}):data.targetType==="category"?await tx.category.count({where:{id:data.targetId}}):data.targetType==="tag"?await tx.tag.count({where:{id:data.targetId}}):data.targetType==="article"?await tx.storeRecord.count({where:{id:data.targetId,kind:"article"}}):await tx.order.count({where:{id:data.targetId}});
      if(!target) throw new DomainError("INVALID_REFERENCE","مقصد محتوا پیدا نشد.");
    }
    for(const field of ["productIds","relatedProductIds","relatedArticleIds","categoryIds"] as const) if(field in data) {
      const values=ids(String((data as Record<string,unknown>)[field])); if(values.length>40) throw new DomainError("INVALID_REFERENCE","حداکثر ۴۰ ارتباط مجاز است.");
      const count=field==="relatedArticleIds"?await tx.storeRecord.count({where:{id:{in:values},kind:"article"}}):field==="categoryIds"?await tx.category.count({where:{id:{in:values}}}):await tx.product.count({where:{id:{in:values}}});
      if(count!==values.length) throw new DomainError("INVALID_REFERENCE","شناسهٔ مرتبط معتبر نیست.");
    }
    if(parsed.status==="ACTIVE" && (("body" in data && !data.body.trim()) || ("answer" in data && !data.answer.trim()) || (kind==="banner" && !("imageUrl" in data && data.imageUrl)))) throw new DomainError("PUBLICATION_INCOMPLETE","برای انتشار، محتوای کامل وارد کنید.");
    const payload={title:parsed.title,slug:parsed.slug,status:parsed.status,data:data as Prisma.InputJsonValue};
    const saved=previous?await tx.storeRecord.update({where:{id:previous.id},data:{...payload,version:{increment:1}}}):await tx.storeRecord.create({data:{...payload,kind}});
    await tx.auditLog.create({data:{actorId,entityType:"StoreRecord",entityId:saved.id,action:`${kind}.save`,changes:{version:saved.version,status:saved.status}}});
    return saved;
  });
}
export async function publicRecords(db: PrismaClient, kind: RecordKind) {
  return db.storeRecord.findMany({where:{kind,status:"ACTIVE"},orderBy:[{createdAt:"desc"},{id:"desc"}],take:200});
}
export async function publicSettings(db: PrismaClient) {
  const record=await db.storeRecord.findUnique({where:{kind_slug:{kind:"settings",slug:"shop"}}});
  if(!record || record.status!=="ACTIVE") return null;
  const d=recordSchemas.settings.parse(record.data);
  const {orderPhone,...visible}=d; void orderPhone; return visible;
}
