import {createHmac,randomUUID} from "node:crypto";
import {cookies} from "next/headers";
import {z} from "zod";
import {isSameOrigin} from "@/modules/identity/http";
import {authEnv} from "@/config/env";
import {readJson} from "@/shared/http-input";
import {catalogOperation} from "@/modules/catalog/http";
import {getDatabase} from "@/infrastructure/database/server";
import {publicTarget} from "@/modules/operations/engagement";
import {operationLimit} from "@/modules/operations/rate-limit";
import {DomainError} from "@/shared/domain-error";
export function POST(request:Request){return catalogOperation(async()=>{if(!isSameOrigin(request,new URL(authEnv().BETTER_AUTH_URL).origin))throw new DomainError("FORBIDDEN","درخواست معتبر نیست.");const d=z.object({kind:z.enum(["product","article","cart","login","checkout","payment","purchase"]),targetId:z.string().max(100)}).parse(await readJson(request));const jar=await cookies(),old=jar.get("store-visitor")?.value,visitor=old&&z.uuid().safeParse(old).success?old:randomUUID();await operationLimit("visit-global","all",2000,60);await operationLimit("visit",visitor,30,60);const db=getDatabase();if(["product","article"].includes(d.kind)&&!await publicTarget(db,d.kind,d.targetId))throw new DomainError("NOT_FOUND","صفحه پیدا نشد.");const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),visitorHash=createHmac("sha256",authEnv().BETTER_AUTH_SECRET).update(`visits:${visitor}:${day}`).digest("hex");await db.visitEvent.upsert({where:{kind_targetId_visitorHash_day:{...d,visitorHash,day}},update:{},create:{...d,visitorHash,day}});jar.set("store-visitor",visitor,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:365*86400,path:"/"});return{recorded:true};});}
