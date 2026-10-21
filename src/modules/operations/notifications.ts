import {templateTokens} from "./notification-definitions";
import {Prisma,type PrismaClient} from "../../generated/prisma/client";
import {recordSchemas} from "./contracts";
import {normalizePhone} from "../identity/input";
import {purchasePolicy} from "../catalog/purchase-policy";
import {getLookups,productInclude,visibleCategoryIds} from "../catalog/repository";
export async function queueNotification(tx:Prisma.TransactionClient,event:{topic:string;phone:string;userId?:string;eventKey:string;values?:Record<string,string>;availableAt?:Date}){
 const records=await tx.storeRecord.findMany({where:{kind:"notification",status:"ACTIVE"},orderBy:{updatedAt:"desc"}});
 const config=records.map(r=>recordSchemas.notification.parse(r.data)).find(d=>d.topic===event.topic);
 const text=(config?.template??"").replace(/\{\{(\w+)\}\}/g,(_,key)=>event.values?.[key]?.slice(0,100)??"");
 return tx.notification.upsert({where:{eventKey:event.eventKey},update:{},create:{eventKey:event.eventKey,phone:normalizePhone(event.phone),userId:event.userId,topic:event.topic,text,templateValues:event.values??{},status:config?.enabled&&text?"QUEUED":"DISABLED",availableAt:event.availableAt??new Date()}});
}
export async function notifyOrder(tx:Prisma.TransactionClient,orderId:string,topic:string){
 const order=await tx.order.findUniqueOrThrow({where:{id:orderId},include:{user:true}});
 if(order.user.phoneNumber)await queueNotification(tx,{topic,phone:order.user.phoneNumber,userId:order.userId,eventKey:`${topic}:${orderId}`,values:{number:String(order.number),amount:order.totalRial.toString()}});
 if(topic==="order.created"){
  const settings=await tx.storeRecord.findUnique({where:{kind_slug:{kind:"settings",slug:"shop"}}});
  const phone=settings?recordSchemas.settings.parse(settings.data).orderPhone:"";
  if(phone)await queueNotification(tx,{topic:"staff.neworder",phone,eventKey:`staff.neworder:${orderId}`,values:{number:String(order.number)}});
 }
}
export interface TextSmsProvider { send(phone:string,text:string):Promise<{id:string}>; sendTemplate?(phone:string,template:string,token:string):Promise<{id:string}> }
export class OperationalSms implements TextSmsProvider {
 constructor(private provider:"kavenegar"|"mellipayamak",private transport:typeof fetch=fetch){}
 async sendTemplate(phone:string,template:string,token:string){
  if(this.provider!=="kavenegar"||!process.env.KAVENEGAR_API_KEY||!template||!token||!/^[A-Za-z0-9]+$/.test(template)||/[\s\u0000-\u001f]/.test(token)||token.length>100)throw new Error("SMS_TEMPLATE_NOT_CONFIGURED");
  try{const response=await this.transport(`https://api.kavenegar.com/v1/${encodeURIComponent(process.env.KAVENEGAR_API_KEY)}/verify/lookup.json`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({receptor:normalizePhone(phone),template,token,type:"sms"}),signal:AbortSignal.timeout(10000),redirect:"error"});const body=await response.json() as {return?:{status:number};entries?:{messageid:number}[]};if(!response.ok||body.return?.status!==200||!body.entries?.[0]?.messageid)throw new Error("UNCERTAIN");return{id:String(body.entries[0].messageid)};}catch{throw new Error("SMS_OUTCOME_UNCERTAIN");}
 }
 async send(phone:string,text:string){
  try {
   if(this.provider==="kavenegar"){
    const key=process.env.KAVENEGAR_API_KEY,sender=process.env.KAVENEGAR_SENDER;if(!key||!sender)throw new Error("NOT_CONFIGURED");
    const response=await this.transport(`https://api.kavenegar.com/v1/${encodeURIComponent(key)}/sms/send.json`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({receptor:normalizePhone(phone),sender,message:text}),signal:AbortSignal.timeout(10000),redirect:"error"});
    const body=await response.json() as {return?:{status:number};entries?:{messageid:number}[]};if(!response.ok||body.return?.status!==200||!body.entries?.[0]?.messageid)throw new Error("UNCERTAIN");return{id:String(body.entries[0].messageid)};
   }
   const username=process.env.MELLIPAYAMAK_USERNAME,password=process.env.MELLIPAYAMAK_PASSWORD,from=process.env.MELLIPAYAMAK_SENDER;if(!username||!password||!from)throw new Error("NOT_CONFIGURED");
   const response=await this.transport("https://rest.payamak-panel.com/api/SendSMS/SendSMS",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},body:new URLSearchParams({username,password,from,to:normalizePhone(phone),text,isFlash:"false"}),signal:AbortSignal.timeout(10000),redirect:"error"});
   const body=await response.json() as {Value?:string|number;RetStatus?:number};if(!response.ok||body.RetStatus!==1||!/^\d{6,30}$/.test(String(body.Value)))throw new Error("UNCERTAIN");return{id:String(body.Value)};
  } catch {throw new Error("SMS_OUTCOME_UNCERTAIN");}
 }
}
async function stillRelevant(tx:Prisma.TransactionClient,item:{topic:string;eventKey:string;userId:string|null;phone:string},now:Date){
 // Queue contents are a snapshot. Check the recipient again in the same
 // transaction that claims the send, including retries after manual review.
 if(item.topic==="staff.neworder"||item.topic==="staff.ready"){
  const settings=await tx.storeRecord.findUnique({where:{kind_slug:{kind:"settings",slug:"shop"}}});
  if(settings?.status!=="ACTIVE"||recordSchemas.settings.parse(settings.data).orderPhone!==item.phone)return false;
 }else{
  const promotional=item.topic==="customer.inactive"||item.topic==="cart.abandoned";
  if(!item.userId||!await tx.user.count({where:{id:item.userId,disabledAt:null,phoneNumberVerified:true,phoneNumber:item.phone,...(promotional?{preference:{marketingConsent:true}}:{})}}))return false;
 }
 if(item.topic==="cart.abandoned"){
  const [,id,version]=item.eventKey.split(":"),cart=await tx.cart.findFirst({where:{id,userId:item.userId,activityVersion:Number(version),updatedAt:{lte:new Date(now.getTime()-7200000)},items:{some:{}}}});
  return !!cart&&!await tx.order.count({where:{userId:item.userId!,createdAt:{gte:cart.updatedAt},status:{not:"CANCELLED"}}});
 }
 if(item.topic==="customer.inactive"){
  const configs=await tx.storeRecord.findMany({where:{kind:"notification",status:"ACTIVE"},orderBy:{updatedAt:"desc"}}),config=configs.map(r=>recordSchemas.notification.parse(r.data)).find(c=>c.topic===item.topic&&c.enabled);if(!config||!item.userId)return false;
  return !await tx.order.count({where:{userId:item.userId,createdAt:{gte:new Date(now.getTime()-config.inactiveDays*86400000)},status:{not:"CANCELLED"}}});
 }
 if(item.topic==="stock.available"){
  if(!item.userId)return false;
  const [,id,cycle]=item.eventKey.split(":"),r=await tx.restockRequest.findFirst({where:{id,userId:item.userId,sentAt:null,createdAt:new Date(Number(cycle))},include:{user:true,variant:{include:{stock:true,product:{include:productInclude}}}}});
  const policy=purchasePolicy(visibleCategoryIds((await getLookups(tx)).categories));return !!r&&!r.user.disabledAt&&r.user.phoneNumber===item.phone&&r.user.phoneNumberVerified&&policy.allowsVariant(r.variant)&&!!r.variant.stock&&r.variant.stock.onHand>r.variant.stock.reserved;
 }
 if(item.topic==="staff.ready"){const [,id]=item.eventKey.split(":");return !!await tx.order.count({where:{id,status:"PROCESSING",shipments:{some:{status:"PACKED"}}}});}
 return true;
}
export async function processNotifications(db:PrismaClient,provider?:(name:"kavenegar"|"mellipayamak")=>TextSmsProvider){
 const due=await db.notification.findMany({where:{status:"QUEUED",availableAt:{lte:new Date()}},take:20,orderBy:{createdAt:"asc"}});
 let sent=0;
 for(const item of due){
  const configs=await db.storeRecord.findMany({where:{kind:"notification",status:"ACTIVE"},orderBy:{updatedAt:"desc"}}),config=configs.map(r=>recordSchemas.notification.parse(r.data)).find(c=>c.topic===item.topic&&c.enabled);
  if(!config){await db.notification.updateMany({where:{id:item.id,status:"QUEUED"},data:{status:"DISABLED"}});continue;}
  const mapping=templateTokens[item.topic],values=(item.templateValues??{}) as Record<string,string>,token=mapping?values[mapping.value]:undefined;
  if(config.deliveryMode==="TEMPLATE"&&(!config.templateApproved||!config.providerTemplate||config.provider!=="kavenegar"||!token||/[\s\u0000-\u001f]/.test(token)||token.length>100)){await db.notification.updateMany({where:{id:item.id,status:"QUEUED"},data:{status:"DISABLED",lastError:"APPROVED_TEMPLATE_REQUIRED"}});continue;}
  const configured=provider || (config.provider==="kavenegar"?process.env.KAVENEGAR_API_KEY&&(config.deliveryMode==="TEMPLATE"||process.env.KAVENEGAR_SENDER):process.env.MELLIPAYAMAK_USERNAME&&process.env.MELLIPAYAMAK_PASSWORD&&process.env.MELLIPAYAMAK_SENDER);
  if(!configured){await db.notification.updateMany({where:{id:item.id,status:"QUEUED"},data:{availableAt:new Date(Date.now()+15*60000)}});continue;}
  const claimed=await db.$transaction(async tx=>{if(!await stillRelevant(tx,item,new Date())){await tx.notification.updateMany({where:{id:item.id,status:"QUEUED"},data:{status:"DISABLED",lastError:"TRIGGER_EXPIRED"}});return false;}const claim=await tx.notification.updateMany({where:{id:item.id,status:"QUEUED"},data:{status:"SENDING",attempts:{increment:1}}});return claim.count===1;});if(!claimed)continue;
  try{const sender=provider?provider(config.provider):new OperationalSms(config.provider);const result=config.deliveryMode==="TEMPLATE"?await sender.sendTemplate!(item.phone,config.providerTemplate,token!):await sender.send(item.phone,item.text);await db.$transaction(async tx=>{const sentAt=new Date();await tx.notification.update({where:{id:item.id},data:{status:"SENT",sentAt,providerRef:result.id}});if(item.topic==="stock.available"){const [,requestId,cycle]=item.eventKey.split(":");if(requestId&&cycle)await tx.restockRequest.updateMany({where:{id:requestId,createdAt:new Date(Number(cycle)),sentAt:null},data:{sentAt}});}});sent++;}
  catch{await db.notification.update({where:{id:item.id},data:{status:"NEEDS_REVIEW",lastError:"PROVIDER_OUTCOME_UNCERTAIN"}});}
 }
 // A crashed sender may have transmitted already. Never automatically resend.
 await db.notification.updateMany({where:{status:"SENDING",updatedAt:{lt:new Date(Date.now()-15*60000)}},data:{status:"NEEDS_REVIEW",lastError:"SENDER_INTERRUPTED"}});
 return {sent};
}
export async function scheduleAutomations(db:PrismaClient,now=new Date()){
 const configs=(await db.storeRecord.findMany({where:{kind:"notification",status:"ACTIVE"},orderBy:{updatedAt:"desc"}})).map(r=>recordSchemas.notification.parse(r.data));
 const enabled=(topic:string)=>configs.some(c=>c.topic===topic&&c.enabled&&c.template);
 if(enabled("cart.abandoned")){
 const rows=await db.$queryRaw<{id:string}[]>`SELECT c.id FROM "Cart" c JOIN "User" u ON u.id=c."userId" JOIN "CustomerPreference" cp ON cp."userId"=u.id WHERE c."updatedAt"<${new Date(now.getTime()-7200000)} AND c."activityVersion"<>c."remindedVersion" AND cp."marketingConsent" AND u."phoneNumberVerified" AND u."disabledAt" IS NULL AND EXISTS(SELECT 1 FROM "CartItem" i WHERE i."cartId"=c.id) AND NOT EXISTS(SELECT 1 FROM "Order" o WHERE o."userId"=u.id AND o."createdAt">=c."updatedAt" AND o.status<>'CANCELLED') ORDER BY c."updatedAt" LIMIT 50`;
 for(const {id} of rows){const cart=await db.cart.findUnique({where:{id},include:{user:true}});if(!cart?.user?.phoneNumber)continue;await db.$transaction(async tx=>{const changed=await tx.cart.updateMany({where:{id,activityVersion:cart.activityVersion,remindedVersion:cart.remindedVersion},data:{remindedVersion:cart.activityVersion,updatedAt:cart.updatedAt}});if(changed.count)await queueNotification(tx,{topic:"cart.abandoned",phone:cart.user!.phoneNumber!,userId:cart.userId!,eventKey:`cart:${id}:${cart.activityVersion}`});});}
 }
 if(enabled("stock.available")){
 const policy=purchasePolicy(visibleCategoryIds((await getLookups(db)).categories));
 const rows=await db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT r.id FROM "RestockRequest" r JOIN "ProductVariant" v ON v.id=r."variantId" JOIN "Product" p ON p.id=v."productId" JOIN "Stock" s ON s."variantId"=v.id JOIN "User" u ON u.id=r."userId" WHERE r."sentAt" IS NULL AND s."onHand">s.reserved AND u."phoneNumberVerified" AND u."disabledAt" IS NULL AND ${policy.sql} AND NOT EXISTS(SELECT 1 FROM "Notification" n WHERE n."eventKey"='restock:'||r.id||':'||(extract(epoch from r."createdAt")*1000)::bigint::text AND n.status IN ('SENT','QUEUED','SENDING','NEEDS_REVIEW')) ORDER BY r."createdAt" LIMIT 100`);
 for(const {id} of rows){const r=await db.restockRequest.findUnique({where:{id},include:{user:true,variant:{include:{product:true}}}});if(!r?.user.phoneNumber)continue;await db.$transaction(async tx=>{const key=`restock:${r.id}:${r.createdAt.getTime()}`;await tx.notification.deleteMany({where:{eventKey:key,status:"DISABLED"}});await queueNotification(tx,{topic:"stock.available",phone:r.user.phoneNumber!,userId:r.userId,eventKey:key,values:{product:r.variant.product.name,sku:r.variant.sku}});});}
 }
 if(enabled("order.followup")){
 const orders=await db.order.findMany({where:{status:{not:"CANCELLED"},shipments:{some:{status:{in:["SHIPPED","DELIVERED"]},shippedAt:{lte:new Date(now.getTime()-5*86400000)}}},events:{none:{type:"followup.scheduled"}}},take:100,orderBy:{createdAt:"asc"}});
 for(const order of orders)await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${order.id},2))`;if(await tx.orderEvent.count({where:{orderId:order.id,type:"followup.scheduled"}}))return;await notifyOrder(tx,order.id,"order.followup");await tx.orderEvent.create({data:{orderId:order.id,type:"followup.scheduled"}});});
 }
 const settings=await db.storeRecord.findUnique({where:{kind_slug:{kind:"settings",slug:"shop"}}}),staffPhone=settings?.status==="ACTIVE"?recordSchemas.settings.parse(settings.data).orderPhone:"";
 if(staffPhone&&enabled("staff.ready")){const day=now.toISOString().slice(0,10),ready=await db.$queryRaw<{id:string;number:number}[]>`SELECT o.id,o.number FROM "Order" o WHERE o.status='PROCESSING' AND EXISTS(SELECT 1 FROM "Shipment" s WHERE s."orderId"=o.id AND s.status='PACKED') AND NOT EXISTS(SELECT 1 FROM "Notification" n WHERE n."eventKey"='ready:'||o.id||':'||${day}) ORDER BY o."createdAt" LIMIT 100`;for(const order of ready)await db.$transaction(tx=>queueNotification(tx,{topic:"staff.ready",phone:staffPhone,eventKey:`ready:${order.id}:${day}`,values:{number:String(order.number)}}));}
 const inactiveConfig=configs.find(d=>d.topic==="customer.inactive"&&d.enabled);
 if(inactiveConfig){const cutoff=new Date(now.getTime()-inactiveConfig.inactiveDays*86400000),month=now.toISOString().slice(0,7);const users=await db.user.findMany({where:{phoneNumberVerified:true,disabledAt:null,roles:{none:{}},preference:{marketingConsent:true},createdAt:{lt:cutoff},orders:{none:{createdAt:{gte:cutoff}}},notifications:{none:{topic:"customer.inactive",createdAt:{gte:new Date(`${month}-01T00:00:00Z`)}}}},take:100,orderBy:{id:"asc"}});for(const user of users)if(user.phoneNumber)await db.$transaction(tx=>queueNotification(tx,{topic:"customer.inactive",phone:user.phoneNumber!,userId:user.id,eventKey:`inactive:${user.id}:${month}`}));}
 await db.cart.deleteMany({where:{userId:null,expiresAt:{lt:now}}});await db.visitEvent.deleteMany({where:{createdAt:{lt:new Date(now.getTime()-400*86400000)}}});
}
