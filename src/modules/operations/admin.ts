import {abandonedCartSql} from "./cart-query";
import {z} from "zod";
import {Prisma,type PrismaClient} from "../../generated/prisma/client";
import {requirePermission} from "../identity/authorization";
import {DomainError} from "../../shared/domain-error";
import {customers,customerDetails,createCustomer,changeWallet} from "./customers";
import {jsonSafe} from "../../shared/json";
export const deskKinds=["customers","leads","restock","notifications","carts","low-stock"] as const;
export type DeskKind=typeof deskKinds[number];
export const deskPermissions={customers:"customers.read",leads:"customers.read",restock:"customers.read",notifications:"settings.write",carts:"customers.read","low-stock":"inventory.read"} as const;
export async function readDesk(db:PrismaClient,actorId:string,kind:DeskKind,q:string,page:number){
 await requirePermission(db,actorId,deskPermissions[kind]);
 const take=25,skip=(Math.max(1,Math.min(100000,page))-1)*take;
 if(kind==="customers")return jsonSafe(await customers(db,actorId,q,page));
 if(kind==="leads"){const where=q?{OR:[{name:{contains:q}},{phone:{contains:q}},{status:{equals:q}}]}:{};const [total,rows]=await db.$transaction([db.lead.count({where}),db.lead.findMany({where,take,skip,orderBy:{createdAt:"desc"}})]);return {total,rows};}
 if(kind==="restock"){const where={...(q?{variant:{product:{name:{contains:q}}}}:{})};const [total,rows]=await db.$transaction([db.restockRequest.count({where}),db.restockRequest.findMany({where,take,skip,orderBy:{createdAt:"desc"},include:{user:{select:{name:true,phoneNumber:true}},variant:{select:{name:true,sku:true,product:{select:{name:true}}}}}})]);return {total,rows};}
 if(kind==="notifications"){const where=q?{OR:[{phone:{contains:q}},{status:{equals:q}},{topic:{contains:q}}]}:{};const [total,rows]=await db.$transaction([db.notification.count({where}),db.notification.findMany({where,take,skip,orderBy:{createdAt:"desc"},select:{id:true,phone:true,topic:true,text:true,status:true,attempts:true,sentAt:true,lastError:true,createdAt:true,providerRef:true}})]);return {total,rows};}
 if(kind==="carts"){
  const predicate=abandonedCartSql(new Date(),q);const [count]=await db.$queryRaw<{total:bigint}[]>(Prisma.sql`SELECT count(*)::bigint total FROM "Cart" c WHERE ${predicate}`);
  const ids=await db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT c.id FROM "Cart" c WHERE ${predicate} ORDER BY c."updatedAt" DESC,c.id DESC LIMIT ${take} OFFSET ${skip}`);
  const rows=await db.cart.findMany({where:{id:{in:ids.map(r=>r.id)}},orderBy:[{updatedAt:"desc"},{id:"desc"}],include:{user:{select:{name:true,phoneNumber:true}},items:{include:{variant:{select:{name:true,priceRial:true}}}}}});return jsonSafe({total:Number(count.total),rows});
 }
 const rows=await db.$queryRaw<{id:string;sku:string;name:string;product:string;available:number;suggested:number}[]>`SELECT v.id,v.sku,v.name,p.name AS product,COALESCE(s."onHand"-s.reserved,0)::int AS available,GREATEST(0,v."reorderTarget"-COALESCE(s."onHand"-s.reserved,0))::int AS suggested FROM "ProductVariant" v JOIN "Product" p ON p.id=v."productId" LEFT JOIN "Stock" s ON s."variantId"=v.id WHERE v."isActive" AND COALESCE(s."onHand"-s.reserved,0)<=v."lowStockThreshold" AND p.name ILIKE ${`%${q}%`} ORDER BY available,v.id LIMIT ${take} OFFSET ${skip}`;
 const [count]=await db.$queryRaw<{total:bigint}[]>`SELECT count(*)::bigint total FROM "ProductVariant" v JOIN "Product" p ON p.id=v."productId" LEFT JOIN "Stock" s ON s."variantId"=v.id WHERE v."isActive" AND COALESCE(s."onHand"-s.reserved,0)<=v."lowStockThreshold" AND p.name ILIKE ${`%${q}%`}`;return {total:Number(count.total),rows};
}
export async function deskAction(db:PrismaClient,actorId:string,input:unknown){
 const d=z.discriminatedUnion("action",[
 z.object({action:z.literal("lead"),id:z.string().max(100),status:z.enum(["NEW","CONTACTED","QUALIFIED","CLOSED"]),note:z.string().trim().max(2000)}),
 z.object({action:z.literal("notification"),id:z.string().max(100),confirmedNotDelivered:z.literal(true)}),
 z.object({action:z.literal("customer"),name:z.string(),phoneNumber:z.string()}),
 z.object({action:z.literal("wallet"),userId:z.string(),amountRial:z.string(),reason:z.string(),key:z.uuid()}),
 ]).parse(input);
 if(d.action==="customer")return createCustomer(db,actorId,d);
 if(d.action==="wallet")return jsonSafe(await changeWallet(db,actorId,d));
 return db.$transaction(async tx=>{
  await requirePermission(tx,actorId,d.action==="lead"?"customers.write":"settings.write");
  if(d.action==="lead"){const r=await tx.lead.update({where:{id:d.id},data:{status:d.status,note:d.note}});await tx.auditLog.create({data:{actorId,entityType:"Lead",entityId:r.id,action:"lead.update",changes:{status:d.status}}});return{saved:true};}
  const count=await tx.notification.updateMany({where:{id:d.id,status:{in:["NEEDS_REVIEW","FAILED"]}},data:{status:"QUEUED",lastError:null,availableAt:new Date()}});if(!count.count)throw new DomainError("INVALID_STATE","فقط پیام بررسی‌شده و ناموفق قابل تلاش مجدد است.");
  await tx.auditLog.create({data:{actorId,entityType:"Notification",entityId:d.id,action:"notification.retry",changes:{confirmedNotDelivered:true}}});return{saved:true};
 });
}
export {customerDetails};
