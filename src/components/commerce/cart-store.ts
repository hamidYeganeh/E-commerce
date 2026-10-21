"use client";
import { useMemo, useSyncExternalStore } from "react";
import { cartLinesSchema, type CartLine } from "@/modules/checkout/contracts";
import { subtractPurchasedLines } from "@/modules/operations/cart-reconciliation";
const legacyKey="honey-cart-v1";
export function cartOwner(){return localStorage.getItem("honey-cart-owner")??"guest";}
function storageKey(){return `${legacyKey}:${cartOwner()}`;}
export function cartChangedAt(){return Number(localStorage.getItem(`${storageKey()}:changed`)??0);}
export function localCartLines(){return parse(snapshot());}
export function activateCartOwner(owner:string,lines:CartLine[]){if(cartOwner()==="guest"&&owner!=="guest"){localStorage.removeItem(legacyKey);localStorage.removeItem(`${legacyKey}:guest`);localStorage.removeItem(`${legacyKey}:guest:changed`);}localStorage.setItem("honey-cart-owner",owner);write(lines);}

const event = "honey-cart-updated";
export function requestCartSync(){dispatchEvent(new Event(event));}
function subscribe(callback: () => void) { addEventListener("storage", callback); addEventListener(event, callback); return () => { removeEventListener("storage", callback); removeEventListener(event, callback); }; }
function snapshot() { try { return localStorage.getItem(storageKey()) ?? (cartOwner()==="guest"?localStorage.getItem(legacyKey):null) ?? "[]"; } catch { return "[]"; } }
function contents() { try { const value=JSON.parse(snapshot()); return Array.isArray(value)?{lines:value}:value; } catch { return {lines:[]}; } }
function parse(raw: string): CartLine[] { try { const value = JSON.parse(raw), lines = Array.isArray(value)?value:value.lines; return Array.isArray(lines) && !lines.length ? [] : cartLinesSchema.parse(lines); } catch { return []; } }
function write(lines: CartLine[], metadata: Record<string,unknown> = {}) { localStorage.setItem(storageKey(), JSON.stringify({...contents(),...metadata,lines}));localStorage.setItem(`${storageKey()}:changed`,String(Date.now())); dispatchEvent(new Event(event)); }
export function pendingCartCheckout(): {id:string;lines:CartLine[]}|null { return contents().pendingCheckout??null; }
export function rememberCartCheckout(id:string,lines:CartLine[]) { write(localCartLines(),{pendingCheckout:{id,lines:cartLinesSchema.parse(lines)}}); }
export function applyCartSettlement(checkoutKey:string,purchased:CartLine[]) {
 const current=contents();
 if(current.pendingCheckout?.id!==checkoutKey || current.settledCheckout===checkoutKey)return false;
 // Lines and receipt are one atomic localStorage write, shared across tabs.
 const base=cartBaseline();
 write(subtractPurchasedLines(localCartLines(),purchased),{settledCheckout:checkoutKey,pendingCheckout:null,...(base?{serverBaseline:{...base,lines:subtractPurchasedLines(base.lines,purchased)}}:{})});
 try { const saved=JSON.parse(sessionStorage.getItem("honey-checkout-attempt")??"null"); if(saved?.id===checkoutKey)sessionStorage.removeItem("honey-checkout-attempt"); } catch {}
 return true;
}
export type CartBaseline = {lines:CartLine[];activityVersion:number|null};
export type PendingCartWrite = {key:string;lines:CartLine[];expectedActivityVersion:number|null};
export function pendingCartWrite():PendingCartWrite|null{return contents().pendingWrite??null;}
export function rememberCartWrite(pendingWrite:PendingCartWrite|null){localStorage.setItem(storageKey(),JSON.stringify({...contents(),pendingWrite}));}
export function acknowledgeCartWrite(owner:string,key:string,activityVersion:number){
 if(cartOwner()!==owner)return;
 const current=contents(),pending:PendingCartWrite|null=current.pendingWrite;
 if(pending?.key!==key)return;
 localStorage.setItem(storageKey(),JSON.stringify({...current,pendingWrite:null,serverBaseline:{lines:pending.lines,activityVersion}}));
}
export function cartBaseline():CartBaseline|null {return contents().serverBaseline??null;}
export function rememberCartBaseline(owner:string,baseline:CartBaseline){const key=`${legacyKey}:${owner}`;let value;try{value=JSON.parse(localStorage.getItem(key)??"[]");}catch{value=[];}const stored=Array.isArray(value)?{lines:value}:value;if((stored.serverBaseline?.activityVersion??-1)>(baseline.activityVersion??-1))return;localStorage.setItem(key,JSON.stringify({...stored,serverBaseline:baseline}));}
export function useCart() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return { hydrated: raw !== null, lines: useMemo(() => parse(raw ?? "[]"), [raw]) };
}
export function addCartLine(variantId: string, quantity: number) {
  const lines = parse(snapshot()); const current = lines.find(l => l.variantId === variantId);
  const next = current ? lines.map(l => l.variantId === variantId ? { ...l, quantity: l.quantity + quantity } : l) : [...lines, { variantId, quantity }];
  const result = cartLinesSchema.safeParse(next); if (!result.success) throw new Error("حداکثر ۲۰ عدد از هر تنوع و ۲۰ تنوع در سبد مجاز است.");
  try { write(result.data); } catch { throw new Error("ذخیرهٔ سبد در مرورگر ممکن نیست. تنظیمات مرورگر را بررسی کنید."); }
}
export function updateCartLine(variantId: string, quantity: number) { const lines = parse(snapshot()); const next = quantity === 0 ? lines.filter(l => l.variantId !== variantId) : lines.map(l => l.variantId === variantId ? { ...l, quantity } : l); if (next.length) cartLinesSchema.parse(next); write(next); }
export function consumeCartLines(purchased: CartLine[]) {
  write(subtractPurchasedLines(parse(snapshot()), purchased));
}
export function replaceCartLines(input: unknown) { const lines=Array.isArray(input)&&!input.length?[]:cartLinesSchema.parse(input);write(lines); }
