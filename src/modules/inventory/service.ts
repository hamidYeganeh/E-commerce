import type { PrismaClient } from "../../generated/prisma/client";
import { stockSchema } from "../catalog/contracts";
import { requirePermission } from "../identity/authorization";
import { DomainError } from "../../shared/domain-error";

export async function adjustStock(db: PrismaClient, actorId: string, variantId: string, input: unknown) {
  const data = stockSchema.parse(input);
  return db.$transaction(async (tx) => {
    await requirePermission(tx, actorId, "inventory.write");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${variantId}, 1))`;
    const eventKey = `manual:${data.eventKey}`;
    const previous = await tx.stockMovement.findUnique({ where: { eventKey } });
    if (previous) {
      if (previous.variantId !== variantId || previous.actorId !== actorId || previous.reason !== data.reason) throw new DomainError("IDEMPOTENCY_CONFLICT", "شناسهٔ درخواست قبلاً استفاده شده است.");
      const record = await tx.auditLog.findFirst({ where: { entityType: "Stock", entityId: variantId, action: "stock.adjusted", changes: { path: ["eventKey"], equals: eventKey } } });
      if (!record || (record.changes as { onHand?: number }).onHand !== data.onHand) throw new DomainError("IDEMPOTENCY_CONFLICT", "محتوای درخواست تغییر کرده است.");
      return tx.stock.findUniqueOrThrow({ where: { variantId } });
    }
    const stock = await tx.stock.findUnique({ where: { variantId } });
    if (!stock) throw new DomainError("NOT_FOUND", "موجودی پیدا نشد.");
    if (stock.version !== data.version) throw new DomainError("VERSION_CONFLICT", "موجودی تغییر کرده است؛ صفحه را تازه کنید.");
    if (data.onHand < stock.reserved) throw new DomainError("RESERVED_STOCK", "موجودی نمی‌تواند کمتر از تعداد رزروشده باشد.");
    const delta = data.onHand - stock.onHand;
    if (!delta) throw new DomainError("UNCHANGED_STOCK", "تعداد موجودی تغییری نکرده است.");
    if (delta < 0 && await tx.inventoryLot.count({ where: { variantId, remaining: { gt: 0 } } })) throw new DomainError("TRACKED_STOCK", "برای موجودی سری‌دار از اصلاح تعداد سری استفاده کنید.");
    // Conditional update also protects against a concurrent checkout/reservation writer.
    const updated = await tx.stock.updateMany({ where: { variantId, version: data.version, onHand: stock.onHand, reserved: stock.reserved }, data: { onHand: data.onHand, unitCostRial: null, version: { increment: 1 } } });
    if (updated.count !== 1) throw new DomainError("VERSION_CONFLICT", "موجودی هم‌زمان تغییر کرده است.");
    await tx.stockMovement.create({ data: { actorId, variantId, eventKey, reason: data.reason, quantity: delta, type: "ADJUSTMENT" } });
    await tx.auditLog.create({ data: { actorId, action: "stock.adjusted", entityType: "Stock", entityId: variantId, changes: { eventKey, before: stock.onHand, onHand: data.onHand, reserved: stock.reserved } } });
    return tx.stock.findUniqueOrThrow({ where: { variantId } });
  });
}
