import type { PrismaClient } from "../generated/prisma/client";
import { reconcilePaymentBatch } from "../modules/payments/reconciliation";
import {resolveGateway} from "../modules/payments/gateways";
// Reconcile retired gateways too: disabling checkout never discards a pending payment.
export async function reconcilePayments(db: PrismaClient) {
 const providers=await db.paymentAttempt.findMany({where:{status:{in:["PENDING","NEEDS_REVIEW"]}},distinct:["provider"],select:{provider:true}});
 const results={checked:0,verified:0,failed:0,review:0,errors:0};for(const item of providers){try{const g=await resolveGateway(db,item.provider,true);const batch=await reconcilePaymentBatch(db,g.provider,g.name);for(const key of ["checked","verified","failed","review","errors"] as const)results[key]+=batch[key];}catch{results.errors++;}}return results;
}
