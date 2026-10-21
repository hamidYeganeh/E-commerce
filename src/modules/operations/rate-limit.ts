import {createHash} from "node:crypto";
import {connectRedis} from "../../infrastructure/redis/client";
import {DomainError} from "../../shared/domain-error";
export async function operationLimit(scope:string,identity:string,limit:number,seconds:number){const redis=await connectRedis(),key=`operations:${scope}:${createHash("sha256").update(identity).digest("hex")}`;const n=Number(await redis.eval("local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end;return n",1,key,seconds));if(n>limit)throw new DomainError("RATE_LIMITED","درخواست‌ها زیاد است؛ کمی بعد تلاش کنید.");}
