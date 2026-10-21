import type {Prisma} from "../src/generated/prisma/client";
import {notificationDefinitions} from "../src/modules/operations/notification-definitions";
export async function seedOperationsDefaults(tx:Prisma.TransactionClient){for(const [topic,title,template] of notificationDefinitions)await tx.storeRecord.upsert({where:{kind_slug:{kind:"notification",slug:`default-${topic.replaceAll(".","-")}`}},update:{},create:{kind:"notification",slug:`default-${topic.replaceAll(".","-")}`,title,status:"DRAFT",data:{topic,template,provider:"kavenegar",enabled:false,inactiveDays:90}}});}
