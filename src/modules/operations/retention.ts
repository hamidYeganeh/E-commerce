import type{PrismaClient}from"../../generated/prisma/client";
// Financial/order/audit histories and ambiguous delivery outcomes are retained.
export async function applyRetention(db:PrismaClient,now=new Date()){
 const cutoff=new Date(now.getTime()-180*86400000),outboxCutoff=new Date(now.getTime()-30*86400000);
 const notifications=await db.notification.deleteMany({where:{status:{in:["SENT","DISABLED"]},createdAt:{lt:cutoff},OR:[{sentAt:{lt:cutoff}},{sentAt:null}]}});
 const outbox=await db.outboxEvent.deleteMany({where:{processedAt:{lt:outboxCutoff}}});
 const invitations=await db.staffInvitation.deleteMany({where:{expiresAt:{lt:outboxCutoff}}});
 return{notifications:notifications.count,outbox:outbox.count,invitations:invitations.count};
}
