import {randomUUID} from "node:crypto";
import {cookies} from "next/headers";
import {z} from "zod";
import {catalogOperation} from "@/modules/catalog/http";
import {getDatabase} from "@/infrastructure/database/server";
import {guestCart} from "@/modules/operations/guest-cart";
import {readJson} from "@/shared/http-input";
import {isSameOrigin} from "@/modules/identity/http";
import {authEnv} from "@/config/env";
import {operationLimit} from "@/modules/operations/rate-limit";
import {DomainError} from "@/shared/domain-error";
async function token(){const jar=await cookies(),old=jar.get("store-cart")?.value;const value=z.uuid().safeParse(old).success?old!:randomUUID();return{jar,value};}
export function GET(){return catalogOperation(async()=>{const {value}=await token();return guestCart(getDatabase(),value);});}
export function PUT(request:Request){return catalogOperation(async()=>{if(!isSameOrigin(request,new URL(authEnv().BETTER_AUTH_URL).origin))throw new DomainError("FORBIDDEN","درخواست معتبر نیست.");const {jar,value}=await token();await operationLimit("guest-cart-global","all",1000,60);await operationLimit("guest-cart",value,60,60);const d=z.object({lines:z.unknown()}).parse(await readJson(request)),result=await guestCart(getDatabase(),value,d.lines);jar.set("store-cart",value,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:30*86400,path:"/"});return result;});}
