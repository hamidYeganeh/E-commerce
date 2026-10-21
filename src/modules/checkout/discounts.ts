import type { Prisma } from "../../generated/prisma/client";
import { couponDiscount } from "../operations/commerce";
export {bundleSchema} from "./bundle-contract";
import {bundleSchema} from "./bundle-contract";
type Line={variantId:string;quantity:number;unitPriceRial:bigint;totalRial:bigint};
export async function cartDiscount(tx:Prisma.TransactionClient,userId:string|undefined,code:string|undefined,subtotal:bigint,lines:Line[],lock=false){
 const coupon=userId?await couponDiscount(tx,userId,code,subtotal,lock,lines):{discount:0n,couponId:null,eligibleIds:[] as string[]};
 let best={discount:0n,bundleId:null as string|null,eligibleIds:[] as string[]};
 for(const record of await tx.storeRecord.findMany({where:{kind:"bundle",status:"ACTIVE"}})){
  const parsed=bundleSchema.safeParse(record.data);if(!parsed.success)continue;const b=parsed.data;
  if(b.items.some(i=>!lines.some(l=>l.variantId===i.variantId&&l.quantity>=i.quantity)))continue;
  const count=Math.min(...b.items.map(i=>Math.floor(lines.find(l=>l.variantId===i.variantId)!.quantity/i.quantity)));
  const original=b.items.reduce((s,i)=>s+lines.find(l=>l.variantId===i.variantId)!.unitPriceRial*BigInt(i.quantity),0n),discount=(original-BigInt(b.priceRial))*BigInt(count);
  if(discount>best.discount)best={discount,bundleId:record.id,eligibleIds:b.items.map(i=>i.variantId)};
 }
 if(coupon.discount>=best.discount)return{discount:coupon.discount,couponId:coupon.couponId,bundleId:null,eligibleIds:coupon.eligibleIds??lines.map(l=>l.variantId)};
 return{...best,couponId:null};
}
export function allocateDiscount<T extends Line>(lines:T[],discount:bigint,eligibleIds:string[]){
 const eligible=lines.filter(l=>eligibleIds.includes(l.variantId)),base=eligible.reduce((s,l)=>s+l.totalRial,0n);let allocated=0n;
 return lines.map(l=>{let value=0n;if(eligible.includes(l)){value=l===eligible.at(-1)?discount-allocated:base?discount*l.totalRial/base:0n;allocated+=value;}return{...l,discountRial:value};});
}
