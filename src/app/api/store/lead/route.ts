import {operationLimit} from "@/modules/operations/rate-limit";
import {createHash} from "node:crypto";
import {catalogOperation} from "@/modules/catalog/http";
import {getDatabase} from "@/infrastructure/database/server";
import {connectRedis} from "@/infrastructure/redis/client";
import {authEnv} from "@/config/env";
import {isSameOrigin} from "@/modules/identity/http";
import {phoneSchema} from "@/modules/identity/input";
import {captureLead} from "@/modules/operations/engagement";
import {DomainError} from "@/shared/domain-error";
import {readJson} from "@/shared/http-input";
export async function POST(request:Request){return catalogOperation(async()=>{
 if(!isSameOrigin(request,new URL(authEnv().BETTER_AUTH_URL).origin))throw new DomainError("FORBIDDEN","مبدأ درخواست معتبر نیست.");
 await operationLimit("lead-global","all",100,60);const input=await readJson(request);const phone=phoneSchema.parse(input&&typeof input==="object"&&"phone" in input?input.phone:"");
 const redis=await connectRedis(),hash=createHash("sha256").update(phone).digest("hex");
 const count=Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3600) end; return n",1,`lead:${hash}`));
 if(count>3)throw new DomainError("RATE_LIMIT","درخواست شما قبلاً ثبت شده است؛ بعداً تلاش کنید.");
 return captureLead(getDatabase(),input);
});}
