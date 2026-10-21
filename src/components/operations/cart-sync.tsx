"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {replaceCartLines,cartOwner,activateCartOwner,cartChangedAt,localCartLines,pendingCartCheckout,applyCartSettlement,cartBaseline,rememberCartBaseline,pendingCartWrite,rememberCartWrite,acknowledgeCartWrite,type PendingCartWrite} from "@/components/commerce/cart-store";
import {combineCarts,rebaseCartChanges} from "@/modules/operations/cart-reconciliation";
import type {CartLine} from "@/modules/checkout/contracts";
import type {CartSettlementReceipt} from "@/modules/checkout/cart-settlement";

type CartSnapshot={owner:string;lines:CartLine[];updatedAt?:string;activityVersion?:number|null;settlement?:CartSettlementReceipt|null;writeReceipt?:{key:string;activityVersion:number}|null};
const same=(a:CartLine[],b:CartLine[])=>a.length===b.length&&a.every(line=>b.some(other=>other.variantId===line.variantId&&other.quantity===line.quantity));

export function CartSync(){
 const path=usePathname();
 useEffect(()=>{
  if(path==="/admin"||path.startsWith("/admin/")||path==="/staff"||path.startsWith("/staff/"))return;
  const controller=new AbortController();
  const request=(url:string,init:RequestInit={})=>fetch(url,{...init,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
  let merged=false;
  let cancelled=false,running=false,dirty=false,timer:ReturnType<typeof setTimeout>|undefined;
  function schedule(){dirty=true;clearTimeout(timer);if(!cancelled)timer=setTimeout(()=>{void sync();},800);}
  async function synchronize(){
   if(cancelled)return;
   const ownerAtStart=cartOwner(),pending=pendingCartCheckout(),pendingWrite=pendingCartWrite();
   const params=new URLSearchParams();
   if(pending)params.set("checkoutKey",pending.id);
   if(pendingWrite)params.set("mutationKey",pendingWrite.key);
   const query=params.size?`?${params}`:"";
   let endpoint="/api/account/cart",response=await request(endpoint+query,{cache:"no-store"});
   if(response.ok&&!merged){await request(endpoint,{method:"POST"});merged=true;response=await request(endpoint+query,{cache:"no-store"});}
   else if(response.status===401){endpoint="/api/store/cart";response=await request(endpoint,{cache:"no-store"});}
   if(!response.ok||cancelled)return;
   const data:CartSnapshot=await response.json();
   if(cancelled)return;
   // Account switching or checkout creation can happen while this read waits.
   // Never apply a stale identity or a receipt-less post-payment snapshot.
   if(cartOwner()!==ownerAtStart||pendingCartCheckout()?.id!==pending?.id){schedule();return;}
   const oldOwner=cartOwner(),owner=String(data.owner??"guest");
   async function persist(write:PendingCartWrite){
    if(cancelled||cartOwner()!==owner)return false;
    const saved=await request(endpoint,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({lines:write.lines,mutationKey:write.key,expectedActivityVersion:write.expectedActivityVersion,expectedOwner:owner})});
    const result=await saved.json();
    if(saved.ok){if(!Number.isInteger(result.activityVersion)||result.activityVersion<0)throw new Error("Unknown cart write outcome");acknowledgeCartWrite(owner,write.key,result.activityVersion);return true;}
    // A proxy/server failure may follow a committed write. Keep its identity
    // until a fresh owned receipt establishes the actual result.
    if(saved.status>=500)throw new Error("Uncertain cart write outcome");
    if(result.code==="CART_VERSION_CONFLICT")schedule();else if(cartOwner()===owner&&pendingCartWrite()?.key===write.key)rememberCartWrite(null);
    return false;
   }
   if(oldOwner===owner&&endpoint==="/api/account/cart"&&pendingWrite){
    if(data.writeReceipt?.key===pendingWrite.key){acknowledgeCartWrite(owner,pendingWrite.key,data.writeReceipt.activityVersion);}
    else if((data.activityVersion??null)===pendingWrite.expectedActivityVersion){if(await persist(pendingWrite))schedule();return;}
    else {rememberCartWrite(null);}
   }
   if(oldOwner!==owner){
    const lines=oldOwner==="guest"&&owner!=="guest"?combineCarts(data.lines,localCartLines()):data.lines;
    activateCartOwner(owner,lines);
   }else{
    // Only this browser's pending checkout receipt consumes local quantities.
    const consumed=data.settlement?applyCartSettlement(data.settlement.checkoutKey,data.settlement.lines):false;
    const base=cartBaseline(),local=localCartLines();
    if(endpoint==="/api/account/cart"&&base){
     const rebased=rebaseCartChanges(base.lines,local,data.lines);
     if(!same(local,rebased))replaceCartLines(rebased);
    }else if(!consumed&&((data.updatedAt&&new Date(data.updatedAt).getTime()>cartChangedAt())||(!local.length&&data.lines.length&&cartChangedAt()===0))){replaceCartLines(data.lines);}
   }
   if(endpoint==="/api/account/cart")rememberCartBaseline(owner,{lines:data.lines,activityVersion:data.activityVersion??null});
   const sent=localCartLines();
   if(same(sent,data.lines))return;
   if(cancelled||cartOwner()!==owner)return;
   if(endpoint==="/api/account/cart"){
    const write={key:crypto.randomUUID(),lines:sent,expectedActivityVersion:data.activityVersion??null};
    rememberCartWrite(write);await persist(write);
   }else await request(endpoint,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({lines:sent})});
  }
  async function sync(){
   if(cancelled||running)return;
   running=true;dirty=false;
   try{
    // Serialize load/rebase/save across tabs sharing this browser's cart.
    if(navigator.locks)await navigator.locks.request("honey-cart-sync",synchronize);else await synchronize();
   }catch{if(!cancelled)timer=setTimeout(()=>{void sync();},15000);}finally{running=false;if(dirty&&!cancelled)schedule();}
  }
  const changed=()=>schedule();
  addEventListener("storage",changed);addEventListener("honey-cart-updated",changed);
  void sync();
  return()=>{cancelled=true;controller.abort();clearTimeout(timer);removeEventListener("storage",changed);removeEventListener("honey-cart-updated",changed);};
 },[path]);
 return null;
}
