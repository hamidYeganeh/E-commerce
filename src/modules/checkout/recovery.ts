import type { PrismaClient } from "../../generated/prisma/client";
import type { PaymentProvider } from "../payments/provider";
import { DomainError } from "../../shared/domain-error";
import { canContinuePayment } from "./continuation";
import { verifyCheckout } from "./submit";

type RecoveryOptions = { providerName: string; continuationEnabled: boolean };
export async function recoverCustomerPayment(db: PrismaClient, userId: string, orderId: string, action: "check" | "continue", provider: PaymentProvider, options: RecoveryOptions) {
  const order = await db.order.findFirst({ where: { id: orderId, userId }, include: { reservations: true, payments: { orderBy: { createdAt: "desc" } } } });
  if (!order) throw new DomainError("NOT_FOUND", "سفارش پیدا نشد.");
  const payment = order.payments.find(p => p.provider === options.providerName);
  if (action === "continue") {
    if (!options.continuationEnabled) throw new DomainError("PAYMENT_NOT_CONFIGURED", "ادامهٔ پرداخت در حال حاضر فعال نیست.");
    if (!canContinuePayment(order, payment, options.providerName)) throw new DomainError("PAYMENT_CANNOT_CONTINUE", "این پرداخت قابل ادامه نیست؛ وضعیت سفارش را دوباره بررسی کنید.");
    return { status: "continue" as const, redirectUrl: provider.redirect(payment!.authority!) };
  }
  if (!payment) throw new DomainError("PAYMENT_NOT_FOUND", "تلاش پرداختی برای بررسی پیدا نشد.");
  if (payment.status === "SUCCEEDED") return { status: "verified" as const };
  if (payment.status === "FAILED") return { status: "failed" as const };
  if (!payment.authority) return { status: "review" as const };
  const result = await verifyCheckout(db, payment.authority, provider, options.providerName);
  return { status: result.status };
}
