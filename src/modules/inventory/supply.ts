import { z } from "zod";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { requirePermission } from "../identity/authorization";
import { DomainError } from "../../shared/domain-error";
const money = z.string().regex(/^\d{1,16}$/);
export async function manageSupply(db: PrismaClient, actorId: string, input: unknown) {
  const d = z.discriminatedUnion("action", [
    z.object({action:z.literal("supplier"),id:z.string().optional(),name:z.string().trim().min(2).max(160),isActive:z.boolean().default(true)}),
    z.object({action:z.literal("batch"),productId:z.string(),code:z.string().trim().min(1).max(100),supplierId:z.string().optional(),origin:z.string().trim().max(300).default(""),producedAt:z.iso.datetime().optional(),expiresAt:z.iso.datetime().optional(),labReportKey:z.string().regex(/^[A-Za-z0-9/_\-.]{1,300}$/).optional()}),
    z.object({action:z.literal("receive"),key:z.uuid(),variantId:z.string(),batchId:z.string(),quantity:z.number().int().min(1).max(1000000),unitCostRial:money,reason:z.string().trim().min(5).max(500)}),
    z.object({action:z.literal("threshold"),variantId:z.string(),lowStockThreshold:z.number().int().min(0).max(1000000),reorderTarget:z.number().int().min(1).max(1000000)})
  ]).parse(input);
  return db.$transaction(async tx => {
    await requirePermission(tx, actorId, "inventory.write");
    let id: string;
    if (d.action === "supplier") {
      const supplier = d.id ? await tx.supplier.update({where:{id:d.id},data:{name:d.name,isActive:d.isActive}}) : await tx.supplier.create({data:{name:d.name,isActive:d.isActive}}); id=supplier.id;
    } else if (d.action === "batch") {
      if (d.producedAt && d.expiresAt && d.producedAt >= d.expiresAt) throw new DomainError("INVALID_DATES", "انقضا باید پس از تولید باشد.");
      if (d.supplierId && !await tx.supplier.count({where:{id:d.supplierId,isActive:true}})) throw new DomainError("INVALID_SUPPLIER", "تأمین‌کننده فعال نیست.");
      const batch=await tx.batch.create({data:{productId:d.productId,code:d.code,supplierId:d.supplierId||null,origin:d.origin,producedAt:d.producedAt?new Date(d.producedAt):null,expiresAt:d.expiresAt?new Date(d.expiresAt):null,labReportKey:d.labReportKey||null}});id=batch.id;
    } else {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${d.variantId},1))`;
      id=d.variantId;
      if (d.action === "threshold") {
        if(d.reorderTarget<=d.lowStockThreshold)throw new DomainError("INVALID_TARGET","هدف تأمین باید بیشتر از آستانه باشد.");
        await tx.productVariant.update({where:{id},data:{lowStockThreshold:d.lowStockThreshold,reorderTarget:d.reorderTarget,version:{increment:1}}});
      } else {
        const eventKey=`receipt:${d.key}`,old=await tx.stockMovement.findUnique({where:{eventKey}});
        if(old){if(old.variantId!==d.variantId||old.batchId!==d.batchId||old.quantity!==d.quantity||old.unitCostRial!==BigInt(d.unitCostRial)||old.reason!==d.reason)throw new DomainError("IDEMPOTENCY_CONFLICT","اطلاعات رسید تکراری متفاوت است.");return{id:old.id};}
        const variant=await tx.productVariant.findUniqueOrThrow({where:{id}}),batch=await tx.batch.findUniqueOrThrow({where:{id:d.batchId}});
        if(batch.productId!==variant.productId||(batch.expiresAt&&batch.expiresAt<=new Date()))throw new DomainError("INVALID_BATCH","سری منقضی یا متعلق به محصول دیگری است.");
        const stock=await tx.stock.findUniqueOrThrow({where:{variantId:id}}),cost=BigInt(d.unitCostRial);
        const unitCostRial=stock.onHand===0?cost:stock.unitCostRial===null?null:(BigInt(stock.onHand)*stock.unitCostRial+BigInt(d.quantity)*cost)/BigInt(stock.onHand+d.quantity);
        await tx.stock.update({where:{variantId:id},data:{onHand:{increment:d.quantity},unitCostRial,version:{increment:1}}});
        await tx.stockMovement.create({data:{variantId:id,batchId:d.batchId,actorId,type:"RECEIPT",quantity:d.quantity,unitCostRial:cost,reason:d.reason,eventKey}});
        await tx.inventoryLot.create({data:{variantId:id,batchId:d.batchId,remaining:d.quantity,unitCostRial:cost}});
      }
    }
    await tx.auditLog.create({data:{actorId,entityType:"Supply",entityId:id,action:`supply.${d.action}`}});
    return {id};
  });
}
// FEFO for tracked receipts; legacy stock remains explicitly untracked/unknown.
export async function allocateSale(tx: Prisma.TransactionClient, orderId: string, variantId: string, quantity: number, onHand: number, averageCost: bigint|null) {
  const lots=await tx.inventoryLot.findMany({where:{variantId,remaining:{gt:0}}});
  const batches=await tx.batch.findMany({where:{id:{in:lots.map(l=>l.batchId)}}});
  const sorted=lots.map(l=>({...l,batch:batches.find(b=>b.id===l.batchId)!})).sort((a,b)=>(a.batch.expiresAt?.getTime()??Infinity)-(b.batch.expiresAt?.getTime()??Infinity)||a.createdAt.getTime()-b.createdAt.getTime());
  const untracked=Math.max(0,onHand-lots.reduce((s,l)=>s+l.remaining,0));
  if(untracked+sorted.filter(l=>!l.batch.expiresAt||l.batch.expiresAt>new Date()).reduce((s,l)=>s+l.remaining,0)<quantity)throw new DomainError("EXPIRED_STOCK","موجودی قابل‌فروش سری‌ها کافی نیست.");
  const item=await tx.orderItem.findFirstOrThrow({where:{orderId,variantId}});
  let remaining=quantity,cost=0n;
  for(const lot of sorted){if(!remaining)break;if(lot.batch.expiresAt&&lot.batch.expiresAt<=new Date())continue;const take=Math.min(remaining,lot.remaining);await tx.inventoryLot.update({where:{id:lot.id},data:{remaining:{decrement:take}}});await tx.orderItemLot.create({data:{orderItemId:item.id,lotId:lot.id,quantity:take}});cost+=BigInt(take)*lot.unitCostRial;remaining-=take;}
  const unitCostRial=remaining&&averageCost===null?null:(cost+BigInt(remaining)*(averageCost??0n))/BigInt(quantity);
  await tx.orderItem.update({where:{id:item.id},data:{unitCostRial}});
  return unitCostRial;
}
