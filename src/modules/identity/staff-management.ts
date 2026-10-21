import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { requirePermission } from "./authorization";
import { DomainError } from "../../shared/domain-error";
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
async function lockStaff(tx:Prisma.TransactionClient){await tx.$executeRaw`SELECT pg_advisory_xact_lock(140019,41)`;}
async function canGrant(tx:Prisma.TransactionClient,actorId:string,roleKey:string){
 const role=await tx.role.findUnique({where:{key:roleKey},include:{permissions:{include:{permission:true}}}});
 if(!role)throw new DomainError("INVALID_ROLE","نقش پیدا نشد.");
 const actor=await tx.user.findUniqueOrThrow({where:{id:actorId},include:{roles:{include:{role:{include:{permissions:{include:{permission:true}}}}}}}});
 const permissions=new Set(actor.roles.flatMap(r=>r.role.permissions.map(p=>p.permission.key)));
 if(role.permissions.some(p=>!permissions.has(p.permission.key)))throw new DomainError("FORBIDDEN","اجازهٔ واگذاری این دسترسی‌ها را ندارید.");
 return role;
}
export async function manageStaff(db:PrismaClient,actorId:string,input:unknown){
 const d=z.discriminatedUnion("action",[
  z.object({action:z.literal("invite"),email:z.email().transform(v=>v.toLowerCase()),name:z.string().trim().min(2).max(100),roleKey:z.string().min(1)}),
  z.object({action:z.literal("access"),userId:z.string(),roleKey:z.string().min(1),disabled:z.boolean()}),
  z.object({action:z.literal("recover"),userId:z.string(),confirmedIdentity:z.literal(true)}),
 ]).parse(input);
 return db.$transaction(async tx=>{
  await requirePermission(tx,actorId,"staff.manage");await lockStaff(tx);
  if(d.action==="invite"){
   await canGrant(tx,actorId,d.roleKey);
   if(await tx.user.count({where:{email:d.email}}))throw new DomainError("ACCOUNT_EXISTS","حساب وجود دارد؛ از بازیابی استفاده کنید.");
   const token=randomBytes(32).toString("base64url");
   await tx.staffInvitation.updateMany({where:{email:d.email,consumedAt:null},data:{consumedAt:new Date()}});
   const invitation=await tx.staffInvitation.create({data:{email:d.email,name:d.name,roleKey:d.roleKey,tokenHash:digest(token),expiresAt:new Date(Date.now()+86400000)}});
   await tx.auditLog.create({data:{actorId,entityType:"StaffInvitation",entityId:invitation.id,action:"staff.invited"}});
   return {url:`/staff/accept#token=${token}`,message:"این پیوند خصوصی را مستقیم به همکار تحویل دهید؛ اعتبار آن ۲۴ ساعت است."};
  }
  if(d.userId===actorId)throw new DomainError("SELF_CHANGE","تغییر دسترسی یا بازیابی خود از این مسیر مجاز نیست.");
  const user=await tx.user.findFirst({where:{id:d.userId,roles:{some:{}}},include:{roles:{include:{role:true}}}});
  if(!user)throw new DomainError("NOT_FOUND","همکار پیدا نشد.");
  for(const role of user.roles)await canGrant(tx,actorId,role.role.key);
  if(d.action==="access"){
   const role=await canGrant(tx,actorId,d.roleKey);
   if(user.roles.some(r=>r.role.key==="owner")&&(d.disabled||role.key!=="owner")&&await tx.user.count({where:{disabledAt:null,roles:{some:{role:{key:"owner"}}}}})<=1)throw new DomainError("LAST_OWNER","آخرین مالک فعال قابل حذف نیست.");
   await tx.userRole.deleteMany({where:{userId:user.id}});await tx.userRole.create({data:{userId:user.id,roleId:role.id}});await tx.user.update({where:{id:user.id},data:{disabledAt:d.disabled?new Date():null}});await tx.session.deleteMany({where:{userId:user.id}});
   await tx.auditLog.create({data:{actorId,entityType:"User",entityId:user.id,action:"staff.access",changes:{roleKey:d.roleKey,disabled:d.disabled}}});return{saved:true};
  }
  const token=randomBytes(32).toString("base64url");
  await tx.staffInvitation.updateMany({where:{userId:user.id,consumedAt:null},data:{consumedAt:new Date()}});
  const ticket=await tx.staffInvitation.create({data:{email:user.email!,name:user.name,roleKey:user.roles[0].role.key,userId:user.id,purpose:"RECOVER",tokenHash:digest(token),expiresAt:new Date(Date.now()+3600000)}});
  await tx.session.deleteMany({where:{userId:user.id}});
  await tx.auditLog.create({data:{actorId,entityType:"StaffInvitation",entityId:ticket.id,action:"staff.recovery_issued",changes:{confirmedIdentity:true}}});
  return{url:`/staff/accept#token=${token}`,message:"پیوند بازیابی خصوصی؛ اعتبار یک ساعت. رمز و عامل دوم پس از استفاده بازنشانی می‌شوند."};
 });
}
export async function acceptStaffInvitation(db:PrismaClient,input:unknown){
 const d=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),password:z.string().min(12).max(128)}).parse(input);
 const existing=await db.staffInvitation.findFirst({where:{tokenHash:digest(d.token),consumedAt:null,expiresAt:{gt:new Date()}}});
 if(!existing)throw new DomainError("INVALID_INVITATION","پیوند معتبر نیست یا منقضی شده است.");
 const password=await hashPassword(d.password);
 return db.$transaction(async tx=>{
  await lockStaff(tx);
  const invitation=await tx.staffInvitation.findUnique({where:{tokenHash:digest(d.token)}});
  if(!invitation||invitation.consumedAt||invitation.expiresAt<=new Date())throw new DomainError("INVALID_INVITATION","پیوند معتبر نیست یا منقضی شده است.");
  let userId:string;
  if(invitation.purpose==="RECOVER"){
   const user=await tx.user.findFirst({where:{id:invitation.userId!,disabledAt:null,roles:{some:{}}}});if(!user)throw new DomainError("INVALID_INVITATION","حساب در دسترس نیست.");userId=user.id;
   await tx.account.upsert({where:{providerId_accountId:{providerId:"credential",accountId:userId}},create:{userId,accountId:userId,providerId:"credential",password},update:{password}});
   await tx.twoFactor.deleteMany({where:{userId}});await tx.user.update({where:{id:userId},data:{twoFactorEnabled:false}});await tx.session.deleteMany({where:{userId}});
  }else{
   const role=await tx.role.findUniqueOrThrow({where:{key:invitation.roleKey}});
   const user=await tx.user.create({data:{name:invitation.name,email:invitation.email,roles:{create:{roleId:role.id}}}});userId=user.id;await tx.account.create({data:{userId,accountId:userId,providerId:"credential",password}});
  }
  await tx.staffInvitation.update({where:{id:invitation.id},data:{consumedAt:new Date()}});
  await tx.auditLog.create({data:{actorId:userId,entityType:"User",entityId:userId,action:invitation.purpose==="RECOVER"?"staff.recovered":"staff.accepted"}});
  return{message:"رمز ثبت شد. وارد شوید و تأیید دومرحله‌ای را تنظیم کنید."};
 });
}
