import type { Order, PaymentAttempt, StockReservation } from "../../generated/prisma/client";

// A continuation reuses the stored invoice; it never authorizes a second request.
export function canContinuePayment(
  order: Pick<Order, "status" | "expiresAt"> & { reservations: Pick<StockReservation, "status" | "expiresAt">[] },
  payment: Pick<PaymentAttempt, "status" | "authority" | "provider"> | undefined,
  providerName: string,
  now = new Date(),
) {
  return order.status === "AWAITING_PAYMENT" && order.expiresAt > now &&
    order.reservations.length > 0 && order.reservations.every(r => r.status === "ACTIVE" && r.expiresAt > now) &&
    payment?.provider === providerName && payment.status === "PENDING" && !!payment.authority;
}
