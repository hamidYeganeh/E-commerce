import { allocateSale } from "./supply";
import type { Prisma } from "../../generated/prisma/client";
import { DomainError } from "../../shared/domain-error";

type ReservationLine = { variantId: string; quantity: number };

/** Reserve inside the caller transaction, then persist the returned rows with its Order.
 * The transaction must commit both or neither. This module owns variant-lock ordering.
 */
export async function reserveStock(tx: Prisma.TransactionClient, lines: readonly ReservationLine[], expiresAt: Date) {
  if (!lines.length || new Set(lines.map(line => line.variantId)).size !== lines.length ||
      lines.some(line => !line.variantId || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) ||
      !Number.isFinite(expiresAt.getTime())) throw new DomainError("INVALID_RESERVATION", "اطلاعات رزرو موجودی معتبر نیست.");
  const sorted = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
  for (const line of sorted) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${line.variantId}, 1))`;
    const stock = await tx.stock.findUnique({ where: { variantId: line.variantId } });
    if (!stock || stock.onHand - stock.reserved < line.quantity) throw new DomainError("INSUFFICIENT_STOCK", "موجودی یکی از محصولات کافی نیست.");
    const updated = await tx.stock.updateMany({ where: { variantId: line.variantId, version: stock.version, onHand: stock.onHand, reserved: stock.reserved }, data: { reserved: { increment: line.quantity }, version: { increment: 1 } } });
    if (updated.count !== 1) throw new DomainError("VERSION_CONFLICT", "موجودی هم‌زمان تغییر کرد؛ دوباره بررسی کنید.");
  }
  return sorted.map(line => ({ ...line, expiresAt }));
}

type Settlement = { status: "RELEASED" } | { status: "CONSUMED"; paymentId: string };

async function settleOrderStock(tx: Prisma.TransactionClient, orderId: string, settlement: Settlement) {
  // Also safe when called by a caller already holding this transaction-scoped lock.
  // Never acquire an Order lock after a variant lock in the same operation.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${orderId}, 2))`;
  const reservations = await tx.stockReservation.findMany({ where: { orderId }, orderBy: { variantId: "asc" } });
  if (settlement.status === "CONSUMED") {
    const payment = await tx.paymentAttempt.findFirst({ where: { id: settlement.paymentId, orderId }, select: { id: true } });
    if (!payment || !reservations.length) throw new DomainError("STOCK_CONFLICT", "موجودی پرداخت‌شده نیاز به بررسی دارد.");
  }
  if (reservations.some(r => r.status !== "ACTIVE" && r.status !== settlement.status)) throw new DomainError("STOCK_CONFLICT", "وضعیت رزرو موجودی با این عملیات سازگار نیست.");
  const active = reservations.filter(r => r.status === "ACTIVE").sort((a, b) => a.variantId.localeCompare(b.variantId));
  for (const reservation of active) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reservation.variantId}, 1))`;
    const stock = await tx.stock.findUniqueOrThrow({ where: { variantId: reservation.variantId } });
    const unitCostRial = settlement.status === "CONSUMED" ? await allocateSale(tx, orderId, reservation.variantId, reservation.quantity, stock.onHand, stock.unitCostRial) : null;
    const changed = await tx.stock.updateMany({
      where: { variantId: reservation.variantId, reserved: { gte: reservation.quantity }, ...(settlement.status === "CONSUMED" ? { onHand: { gte: reservation.quantity } } : {}) },
      data: { reserved: { decrement: reservation.quantity }, ...(settlement.status === "CONSUMED" ? { onHand: { decrement: reservation.quantity } } : {}), version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new DomainError("STOCK_CONFLICT", "رزرو موجودی نیاز به بررسی دارد.");
    const transitioned = await tx.stockReservation.updateMany({ where: { id: reservation.id, status: "ACTIVE" }, data: { status: settlement.status } });
    if (transitioned.count !== 1) throw new DomainError("STOCK_CONFLICT", "وضعیت رزرو موجودی هم‌زمان تغییر کرد.");
    if (settlement.status === "CONSUMED") await tx.stockMovement.create({ data: { variantId: reservation.variantId, orderId, type: "SALE", unitCostRial, quantity: -reservation.quantity, eventKey: `payment:${settlement.paymentId}:${reservation.variantId}`, reason: "پرداخت تأییدشدهٔ سفارش" } });
  }
  return active.length;
}

/** Caller authorizes cancellation/failure and commits Order/PaymentAttempt state atomically. */
export function releaseOrderStock(tx: Prisma.TransactionClient, orderId: string) {
  return settleOrderStock(tx, orderId, { status: "RELEASED" });
}

/** Caller must verify payment first; this function never contacts or trusts a browser gateway. */
export function consumeOrderStock(tx: Prisma.TransactionClient, orderId: string, paymentId: string) {
  return settleOrderStock(tx, orderId, { status: "CONSUMED", paymentId });
}
