import {z} from "zod";
import type {PrismaClient,Prisma} from "../../generated/prisma/client";
import {recordSchemas} from "../operations/contracts";
import {paymentSettings,ZarinpalProvider} from "./zarinpal";
import {DomainError} from "../../shared/domain-error";
export async function availableGateways(db:Prisma.TransactionClient){
 const records=await db.storeRecord.findMany({where:{kind:"gateway",status:"ACTIVE"},orderBy:{title:"asc"}});
 if(!records.length){const s=paymentSettings();return s.enabled?[{id:s.sandbox?"zarinpal-sandbox":"zarinpal",name:"زرین‌پال"}]:[];}
 return records.flatMap(r=>{const d=recordSchemas.gateway.parse(r.data);return process.env.CHECKOUT_ENABLED==="true"&&z.uuid().safeParse(process.env[d.merchantEnv]).success&&(d.sandbox||process.env.NODE_ENV==="production")?[{id:`zarinpal:${r.id}`,name:r.title}]:[];});
}
export async function resolveGateway(db:PrismaClient,name?:string,continuing=false){
 const selected=name??(await availableGateways(db))[0]?.id;
 if(!selected)throw new DomainError("PAYMENT_NOT_CONFIGURED","درگاه پرداخت هنوز فعال نشده است.");
 if(!continuing&&!(await availableGateways(db)).some(g=>g.id===selected))throw new DomainError("PAYMENT_NOT_CONFIGURED","درگاه انتخاب‌شده فعال نیست.");
 if(selected==="zarinpal"||selected==="zarinpal-sandbox"){const s=paymentSettings();if(!s.merchantId)throw new DomainError("PAYMENT_NOT_CONFIGURED","اتصال درگاه تنظیم نشده است.");return{name:selected,provider:new ZarinpalProvider(s.merchantId,selected==="zarinpal-sandbox")};}
 const id=selected.startsWith("zarinpal:")?selected.slice(9):"",r=await db.storeRecord.findFirst({where:{id,kind:"gateway"}});if(!r)throw new DomainError("PAYMENT_NOT_CONFIGURED","تنظیمات درگاه پیدا نشد.");const d=recordSchemas.gateway.parse(r.data),merchant=z.uuid().safeParse(process.env[d.merchantEnv]);if(!merchant.success)throw new DomainError("PAYMENT_NOT_CONFIGURED","کلید درگاه در سرور تنظیم نشده است.");return{name:selected,provider:new ZarinpalProvider(merchant.data,d.sandbox)};
}
