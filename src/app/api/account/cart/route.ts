import {authenticatedApi} from "@/modules/identity/api";
import {catalogOperation} from "@/modules/catalog/http";
import {getDatabase} from "@/infrastructure/database/server";
import {readJson} from "@/shared/http-input";
import {saveCart,ownedCartWriteReceipt} from "@/modules/operations/engagement";
import {cookies} from "next/headers";
import {mergeGuestCart} from "@/modules/operations/guest-cart";
import {z} from "zod";
import {Prisma} from "@/generated/prisma/client";
import {ownedCartSettlement} from "@/modules/checkout/cart-settlement";
export function POST(request:Request){return authenticatedApi(request,identity=>catalogOperation(async()=>{const jar=await cookies(),token=jar.get("store-cart")?.value;if(!z.uuid().safeParse(token).success)return{merged:false};const result=await mergeGuestCart(getDatabase(),identity.user.id,token!);jar.delete("store-cart");return result;}));}
export async function GET(request:Request){
 return authenticatedApi(request,identity=>catalogOperation(async()=>{
  const db=getDatabase(),query=new URL(request.url).searchParams,key=query.get("checkoutKey"),mutationKey=query.get("mutationKey");
  return db.$transaction(async tx=>{
   const cart=await tx.cart.findFirst({where:{userId:identity.user.id},select:{id:true,activityVersion:true,updatedAt:true,items:{select:{variantId:true,quantity:true}}}});
   const settlement=key?await ownedCartSettlement(tx,identity.user.id,key):null;
   const writeReceipt=mutationKey?await ownedCartWriteReceipt(tx,identity.user.id,mutationKey):null;
   return{owner:identity.user.id,cartId:cart?.id??null,activityVersion:cart?.activityVersion??null,settlement,writeReceipt,updatedAt:cart?.updatedAt.toISOString(),lines:cart?.items??[],marketingConsent:(await tx.customerPreference.findUnique({where:{userId:identity.user.id}}))?.marketingConsent??false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }));
}
export async function PUT(request:Request){return authenticatedApi(request,identity=>catalogOperation(async()=>saveCart(getDatabase(),identity.user.id,await readJson(request))));}
