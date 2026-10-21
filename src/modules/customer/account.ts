import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { addressSchema } from "../checkout/contracts";
import { quoteCart } from "../checkout/quote";
import { DomainError } from "../../shared/domain-error";
export async function manageAddress(db:PrismaClient,userId:string,input:unknown){
 const d=z.discriminatedUnion("action",[z.object({action:z.literal("save"),id:z.string().optional(),address:addressSchema}),z.object({action:z.literal("delete"),id:z.string()})]).parse(input);
 return db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId},42))`;if(!await tx.user.count({where:{id:userId,disabledAt:null,phoneNumberVerified:true}}))throw new DomainError("FORBIDDEN","ورود لازم است.");if(d.id&&!await tx.address.count({where:{id:d.id,userId}}))throw new DomainError("NOT_FOUND","نشانی پیدا نشد.");if(d.action==="delete")return tx.address.delete({where:{id:d.id}});if(!d.id&&await tx.address.count({where:{userId}})>=50)throw new DomainError("ADDRESS_LIMIT","حداکثر ۵۰ نشانی مجاز است.");return d.id?tx.address.update({where:{id:d.id},data:d.address}):tx.address.create({data:{userId,...d.address}});});
}
export async function reorder(db:PrismaClient,userId:string,orderId:string){
 const order=await db.order.findFirst({where:{id:orderId,userId},include:{items:true}});if(!order)throw new DomainError("NOT_FOUND","سفارش پیدا نشد.");
 const lines=order.items.map(i=>({variantId:i.variantId,quantity:i.quantity}));
 return{lines,quote:await quoteCart(db,lines)};
}
export async function submitProductReview(db:PrismaClient,userId:string,input:unknown){
 const d=z.object({productId:z.string(),rating:z.number().int().min(1).max(5),body:z.string().trim().min(5).max(3000)}).parse(input);
 return db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId},43))`;const order=await tx.order.findFirst({where:{userId,status:"COMPLETED",payments:{some:{status:"SUCCEEDED"}},items:{some:{variant:{productId:d.productId}}}}});if(!order)throw new DomainError("VERIFIED_PURCHASE_REQUIRED","نقد فقط پس از تحویل خرید خودتان مجاز است.");return tx.productReview.upsert({where:{userId_productId:{userId,productId:d.productId}},create:{...d,userId,orderId:order.id},update:{body:d.body,rating:d.rating,status:"DRAFT"}});});
}
