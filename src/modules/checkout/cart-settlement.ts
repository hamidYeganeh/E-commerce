import { z } from "zod";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { DomainError } from "../../shared/domain-error";
import { cartLinesSchema, type CartLine } from "./contracts";

const linesSchema = z.union([z.tuple([]), cartLinesSchema]);
const receiptSchema = z.object({
  orderId: z.string(), checkoutKey: z.uuid(), settledAt: z.iso.datetime(),
  lines: cartLinesSchema, remainingLines: linesSchema,
  activityVersion: z.number().int().min(0).nullable(), cartId: z.string().nullable(),
});
export type CartSettlementReceipt = z.infer<typeof receiptSchema>;

// Shares the cart lock with saveCart/mergeGuestCart. Call from the financial
// settlement transaction, after recording SUCCEEDED, while holding the Order lock.
export async function settlePurchasedCart(tx: Prisma.TransactionClient, input: {
  orderId: string; userId: string; checkoutKey: string; lines: CartLine[];
}): Promise<CartSettlementReceipt> {
  const lines = cartLinesSchema.parse(input.lines);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId},34))`;
  const order = await tx.order.findFirst({ where: {
    id: input.orderId, userId: input.userId, checkoutKey: input.checkoutKey,
    payments: { some: { status: "SUCCEEDED" } },
  }, select: { items: { select: { variantId: true, quantity: true } } } });
  if (!order || order.items.length !== lines.length || order.items.some(item => !lines.some(line => line.variantId === item.variantId && line.quantity === item.quantity))) {
    throw new DomainError("CART_SETTLEMENT_INVALID", "سفارش پرداخت‌شده برای تطبیق سبد معتبر نیست.");
  }
  const old = await tx.orderEvent.findFirst({ where: { orderId: input.orderId, type: "cart.settled" } });
  if (old) return receiptSchema.parse(old.data);
  const cart = await tx.cart.findFirst({ where: { userId: input.userId }, include: { items: true } });
  const remainingLines = (cart?.items ?? []).flatMap(item => {
    const quantity = Math.max(0, item.quantity - (lines.find(line => line.variantId === item.variantId)?.quantity ?? 0));
    return quantity ? [{ variantId: item.variantId, quantity }] : [];
  });
  let activityVersion = cart?.activityVersion ?? null;
  if (cart) {
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    if (remainingLines.length) await tx.cartItem.createMany({ data: remainingLines.map(line => ({ ...line, cartId: cart.id })) });
    activityVersion = (await tx.cart.update({ where: { id: cart.id }, data: { activityVersion: { increment: 1 } } })).activityVersion;
  }
  const receipt: CartSettlementReceipt = {
    orderId: input.orderId, checkoutKey: input.checkoutKey, settledAt: new Date().toISOString(),
    lines, remainingLines, activityVersion, cartId: cart?.id ?? null,
  };
  await tx.orderEvent.create({ data: { orderId: input.orderId, type: "cart.settled", data: receipt } });
  return receipt;
}

export async function ownedCartSettlement(db: PrismaClient | Prisma.TransactionClient, userId: string, checkoutKey: string): Promise<CartSettlementReceipt | null> {
  const key = z.uuid().parse(checkoutKey);
  const event = await db.orderEvent.findFirst({ where: {
    type: "cart.settled", order: { userId, checkoutKey: key, payments: { some: { status: "SUCCEEDED" } } },
  }, select: { data: true } });
  return event ? receiptSchema.parse(event.data) : null;
}
