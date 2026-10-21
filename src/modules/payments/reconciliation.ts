import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { verifyCheckout } from "../checkout/submit";
import type { PaymentProvider } from "./provider";

// updatedAt already controls the reconciliation retry interval. Touching it with
// a conditional update claims one retry window across Worker replicas. This is
// a polling lease only: it never proves failure or releases StockReservation.
const RETRY_INTERVAL_MS = 15 * 60_000;
export async function reconcilePaymentBatch(db: PrismaClient, provider: PaymentProvider, providerName: string, now = new Date()) {
  const due = {
    provider: providerName,
    status: { in: ["PENDING", "NEEDS_REVIEW"] },
    updatedAt: { lt: new Date(now.getTime() - RETRY_INTERVAL_MS) },
    order: { status: "AWAITING_PAYMENT", expiresAt: { lt: now } },
  } satisfies Prisma.PaymentAttemptWhereInput;
  const attempts = await db.paymentAttempt.findMany({ where: due, take: 10, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] });
  const result = { checked: 0, verified: 0, failed: 0, review: 0, errors: 0 };
  for (const attempt of attempts) {
    try {
      // Repeat every eligibility condition, including authority: a callback or
      // late create response may have changed the row since batch selection.
      const claim = await db.paymentAttempt.updateMany({ where: { ...due, id: attempt.id, authority: attempt.authority, AND: { updatedAt: attempt.updatedAt } }, data: { updatedAt: now } });
      if (!claim.count) continue;
      result.checked++;
      if (!attempt.authority) {
        const marked = await db.paymentAttempt.updateMany({
          where: { id: attempt.id, authority: null, status: { in: ["PENDING", "NEEDS_REVIEW"] }, order: { status: "AWAITING_PAYMENT" } },
          data: { status: "NEEDS_REVIEW", failureCode: "MISSING_AUTHORITY_RECONCILE_MANUALLY" },
        });
        result.review += marked.count;
        continue;
      }
      // Network verification stays outside a database transaction. Settlement
      // uses the same Order lock and idempotent inventory path as callbacks.
      const settled = await verifyCheckout(db, attempt.authority, provider, providerName, now);
      if (settled.status === "verified") result.verified++;
      else if (settled.status === "failed") result.failed++;
      else result.review++;
    } catch {
      // Keep stock and payment state intact on transport/settlement failure;
      // the claimed retry window also keeps a poison item from starving others.
      result.errors++;
    }
  }
  return result;
}
