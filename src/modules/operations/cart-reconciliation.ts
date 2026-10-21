import type {CartLine} from '../checkout/contracts';
export function subtractPurchasedLines(current: CartLine[], purchased: CartLine[]) {
 return current.flatMap(line => { const quantity = line.quantity - (purchased.find(p => p.variantId === line.variantId)?.quantity ?? 0); return quantity > 0 ? [{ ...line, quantity }] : []; });
}
// Rebase unsaved local quantity edits on a newer server cart, including a
// payment settlement. Unrelated variants and quantities added later survive.
export function rebaseCartChanges(base: CartLine[], local: CartLine[], server: CartLine[]) {
 const ids = new Set([...server, ...local].map(line => line.variantId));
 return [...ids].flatMap(variantId => {
  const quantity = Math.min(20, Math.max(0, (server.find(l => l.variantId === variantId)?.quantity ?? 0) + (local.find(l => l.variantId === variantId)?.quantity ?? 0) - (base.find(l => l.variantId === variantId)?.quantity ?? 0)));
  return quantity ? [{variantId, quantity}] : [];
 }).slice(0,20);
}
export function combineCarts(server:CartLine[],guest:CartLine[]){const result=new Map(server.map(l=>[l.variantId,l.quantity]));for(const line of guest){if(result.has(line.variantId))result.set(line.variantId,Math.min(20,Math.max(result.get(line.variantId)!,line.quantity)));else if(result.size<20)result.set(line.variantId,line.quantity);}return [...result].map(([variantId,quantity])=>({variantId,quantity}));}
