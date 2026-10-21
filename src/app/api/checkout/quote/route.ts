import {z} from "zod";
import {authenticatedApi} from "@/modules/identity/api";
import { getDatabase } from "@/infrastructure/database/server";
import { quoteCart } from "@/modules/checkout/quote";
import { catalogOperation } from "@/modules/catalog/http";
import { readJson } from "@/shared/http-input";

export async function POST(request: Request) {
  let body:unknown;const parsed=await catalogOperation(async()=>{body=await readJson(request);return{ok:true};});if(!parsed.ok)return parsed;
  if(Array.isArray(body))return catalogOperation(async()=>quoteCart(getDatabase(),body));
  return authenticatedApi(request,identity=>catalogOperation(async()=>{
    const input=z.object({lines:z.unknown(),address:z.object({province:z.string().min(2).max(80),city:z.string().min(2).max(80)}),shippingMethodId:z.string().max(100).optional(),couponCode:z.string().max(40).optional()}).parse(body);
    return quoteCart(getDatabase(),input.lines,{...input,userId:identity.user.id});
  }));
}
