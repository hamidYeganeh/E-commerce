import { pageNumber,historyPageSize } from "../../shared/pagination";
import {z} from "zod";
import type {PrismaClient} from "../../generated/prisma/client";
import {requirePermission} from "../identity/authorization";
import {phoneSchema} from "../identity/input";
import {DomainError} from "../../shared/domain-error";
import {queueNotification} from "./notifications";
import {customerSearchWhere} from "./customer-search";
export async function customers(db:PrismaClient,actorId:string,q="",page=1){
 await requirePermission(db,actorId,"customers.read");
 const where=customerSearchWhere(q);
 const [total,rows]=await db.$transaction([db.user.count({where}),db.user.findMany({where,take:20,skip:(Math.max(1,Math.min(100000,page))-1)*20,orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true,name:true,phoneNumber:true,phoneNumberVerified:true,createdAt:true,disabledAt:true,_count:{select:{orders:true}},orders:{where:{payments:{some:{status:"SUCCEEDED"}}},orderBy:{confirmedAt:"desc"},select:{number:true,totalRial:true,confirmedAt:true},take:1}}})]);
 return {total,rows};
}
export async function createCustomer(db:PrismaClient,actorId:string,input:unknown){
 const d=z.object({name:z.string().trim().min(2).max(100),phoneNumber:phoneSchema}).parse(input);
 return db.$transaction(async tx=>{await requirePermission(tx,actorId,"customers.write");const user=await tx.user.create({data:{...d,phoneNumberVerified:false}});await tx.auditLog.create({data:{actorId,entityType:"User",entityId:user.id,action:"customer.create"}});return{id:user.id};});
}
export async function customerDetails(db:PrismaClient,actorId:string,id:string,page=1){
 await requirePermission(db,actorId,"customers.read");
 return db.user.findFirst({where:{id,roles:{none:{}}},select:{id:true,name:true,phoneNumber:true,phoneNumberVerified:true,createdAt:true,_count:{select:{orders:true}},orders:{orderBy:[{createdAt:"desc"},{id:"desc"}],take:historyPageSize,skip:(pageNumber(page)-1)*historyPageSize,select:{id:true,number:true,status:true,totalRial:true,createdAt:true,confirmedAt:true}}}});
}
export async function changeWallet(db:PrismaClient,actorId:string,input:unknown){
 const d=z.object({userId:z.string().min(1),amountRial:z.string().regex(/^-?\d{1,15}$/).refine(v=>BigInt(v)!==0n),reason:z.string().trim().min(5).max(500),key:z.uuid()}).parse(input);
 return db.$transaction(async tx=>{
  await requirePermission(tx,actorId,"wallet.write");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${d.userId},33))`;
  const user=await tx.user.findFirst({where:{id:d.userId,disabledAt:null,roles:{none:{}}}});if(!user)throw new DomainError("NOT_FOUND","مشتری پیدا نشد.");
  const old=await tx.walletEntry.findUnique({where:{eventKey:d.key}});if(old){if(old.userId!==d.userId||old.amountRial!==BigInt(d.amountRial)||old.reason!==d.reason)throw new DomainError("IDEMPOTENCY_CONFLICT","کلید با اطلاعات متفاوت استفاده شده است.");return old;}
  const balance=(await tx.walletEntry.aggregate({where:{userId:d.userId},_sum:{amountRial:true}}))._sum.amountRial??0n;
  if(balance+BigInt(d.amountRial)<0n)throw new DomainError("INSUFFICIENT_BALANCE","موجودی کیف پول کافی نیست.");
  const entry=await tx.walletEntry.create({data:{userId:d.userId,actorId,amountRial:BigInt(d.amountRial),reason:d.reason,eventKey:d.key}});
  await tx.auditLog.create({data:{actorId,entityType:"WalletEntry",entityId:entry.id,action:"wallet.adjust",changes:{amountRial:d.amountRial,reason:d.reason}}});
  if(entry.amountRial>0n&&user.phoneNumber)await queueNotification(tx,{topic:"wallet.credited",phone:user.phoneNumber,userId:user.id,eventKey:`wallet:${entry.id}`,values:{amount:d.amountRial}});
  return entry;
 });
}
export async function wallet(db:PrismaClient,userId:string,page=1){
 const user=await db.user.findFirst({where:{id:userId,disabledAt:null}});if(!user)throw new DomainError("FORBIDDEN","ورود لازم است.");
 return {total:await db.walletEntry.count({where:{userId}}),balanceRial:((await db.walletEntry.aggregate({where:{userId},_sum:{amountRial:true}}))._sum.amountRial??0n).toString(),entries:await db.walletEntry.findMany({where:{userId},orderBy:[{createdAt:"desc"},{id:"desc"}],take:historyPageSize,skip:(pageNumber(page)-1)*historyPageSize,select:{id:true,amountRial:true,reason:true,createdAt:true}})};
}
