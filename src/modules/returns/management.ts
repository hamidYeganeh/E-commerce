import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { requirePermission } from "../identity/authorization";
import { DomainError } from "../../shared/domain-error";

const lines = z.array(z.object({ orderItemId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(100000) })).min(1).max(100).refine(v => new Set(v.map(i => i.orderItemId)).size === v.length);
const requestSchema = z.object({ key: z.uuid(), reason: z.string().trim().min(5).max(1000), cancellation: z.boolean().default(false), items: lines });
async function lock(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${orderId},2))`;
}
async function event(tx: Prisma.TransactionClient, actorId: string, orderId: string, entityId: string, action: string) {
  await tx.orderEvent.create({ data: { actorId, orderId, type: action, data: { returnId: entityId } } });
  await tx.auditLog.create({ data: { actorId, entityType: "ReturnRequest", entityId, action } });
  await tx.order.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
}
// Cumulative allocation avoids rounding losses across multiple partial returns.
export function returnedValue(lineTotal: bigint, orderSubtotal: bigint, orderDiscount: bigint, quantity: number, previous: number, count: number) {
  const net = lineTotal - (orderSubtotal ? lineTotal * orderDiscount / orderSubtotal : 0n);
  return net * BigInt(previous + count) / BigInt(quantity) - net * BigInt(previous) / BigInt(quantity);
}
export async function requestReturn(db: PrismaClient, actorId: string, orderId: string, input: unknown, staff = false) {
  const d = requestSchema.parse(input);
  const payloadHash = createHash("sha256").update(JSON.stringify({ ...d, items: [...d.items].sort((a,b) => a.orderItemId.localeCompare(b.orderItemId)) })).digest("hex");
  return db.$transaction(async tx => {
    if (staff) await requirePermission(tx, actorId, "orders.cancel");
    await lock(tx, orderId);
    const order = await tx.order.findFirst({ where: { id: orderId, ...(!staff ? { userId: actorId, user: { disabledAt: null, phoneNumberVerified: true } } : {}) }, include: { items: true, payments: true, shipments: {include:{items:true}}, returns: { include: { items: true } } } });
    if (!order) throw new DomainError("NOT_FOUND", "سفارش پیدا نشد.");
    const old = await tx.returnRequest.findUnique({ where: { key: d.key } });
    if (old) { if (old.orderId !== orderId || old.payloadHash !== payloadHash) throw new DomainError("IDEMPOTENCY_CONFLICT", "درخواست با اطلاعات دیگری ثبت شده است."); return old; }
    if (!order.payments.some(p => p.status === "SUCCEEDED") || order.status === "CANCELLED") throw new DomainError("INVALID_STATE", "فقط سفارش پرداخت‌شده قابل مرجوعی است.");
    if (d.cancellation && (order.shipments.some(s => ["SHIPPED", "DELIVERED", "RETURNED"].includes(s.status)) || order.returns.some(r => r.status !== "REJECTED") || d.items.length !== order.items.length || order.items.some(i => !d.items.some(l => l.orderItemId === i.id && l.quantity === i.quantity)))) throw new DomainError("INVALID_CANCELLATION", "لغو پرداخت‌شده فقط برای تمام اقلام و پیش از ارسال مجاز است.");
    let refundLimitRial = d.cancellation ? order.totalRial : 0n;
    for (const line of d.items) {
      const item = order.items.find(i => i.id === line.orderItemId);
      const previous = order.returns.filter(r => r.status !== "REJECTED").flatMap(r => r.items).filter(i => i.orderItemId === line.orderItemId).reduce((sum,i) => sum+i.quantity,0);
      if (!item || previous + line.quantity > item.quantity) throw new DomainError("RETURN_QUANTITY", "تعداد مرجوعی از تعداد باقی‌مانده بیشتر است.");
      if (!d.cancellation) {
        const shipped=order.shipments.filter(s=>["SHIPPED","DELIVERED","RETURNED"].includes(s.status)).flatMap(s=>s.items).filter(i=>i.orderItemId===line.orderItemId).reduce((sum,i)=>sum+i.quantity,0);
        if(previous+line.quantity>shipped)throw new DomainError("RETURN_NOT_SHIPPED","برای سفارش ارسال‌نشده از لغو کامل استفاده کنید.");
      }
      if (!d.cancellation) refundLimitRial += returnedValue(item.totalRial-item.discountRial, 0n, 0n, item.quantity, previous, line.quantity);
    }
    // Never allocate more money than the order actually collected.
    const allocated = order.returns.filter(r => r.status !== "REJECTED").reduce((sum,r) => sum+r.refundLimitRial,0n);
    if (refundLimitRial > order.totalRial - allocated) refundLimitRial = order.totalRial - allocated;
    const request = await tx.returnRequest.create({ data: { orderId, key: d.key, payloadHash, cancellation: d.cancellation, refundLimitRial, reason: d.reason, items: { create: d.items } } });
    await event(tx, actorId, orderId, request.id, "return.requested");
    return request;
  });
}
const decisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), version: z.number().int().min(0) }),
  z.object({ action: z.literal("reject"), version: z.number().int().min(0), reason: z.string().trim().min(5).max(1000) }),
  z.object({ action: z.literal("receive"), version: z.number().int().min(0), restockItemIds: z.array(z.string()).max(100) }),
]);
export async function manageReturn(db: PrismaClient, actorId: string, id: string, input: unknown) {
  const d = decisionSchema.parse(input);
  return db.$transaction(async tx => {
    await requirePermission(tx, actorId, d.action === "receive" ? "inventory.write" : "orders.cancel");
    const found = await tx.returnRequest.findUnique({ where: { id } });
    if (!found) throw new DomainError("NOT_FOUND", "درخواست پیدا نشد.");
    await lock(tx, found.orderId);
    const r = await tx.returnRequest.findUniqueOrThrow({ where: { id }, include: { items: { include: { orderItem: true } }, order: { include: { shipments: true } } } });
    if (r.version !== d.version) throw new DomainError("VERSION_CONFLICT", "درخواست تغییر کرده است.");
    let status: "APPROVED" | "REJECTED" | "RECEIVED";
    if (d.action === "receive") {
      if (r.status !== "APPROVED" || d.restockItemIds.some(i => !r.items.some(l => l.orderItemId === i))) throw new DomainError("INVALID_STATE", "ابتدا درخواست را تأیید کنید و اقلام معتبر انتخاب کنید.");
      for (const line of [...r.items].sort((a,b) => a.orderItem.variantId.localeCompare(b.orderItem.variantId))) {
        if (!d.restockItemIds.includes(line.orderItemId)) continue;
        const variantId = line.orderItem.variantId;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${variantId},1))`;
        const stock = await tx.stock.findUniqueOrThrow({ where: { variantId } });
        const cost = line.orderItem.unitCostRial;
        const nextCost = stock.onHand === 0 ? cost : stock.unitCostRial !== null && cost !== null ? (BigInt(stock.onHand)*stock.unitCostRial+BigInt(line.quantity)*cost)/BigInt(stock.onHand+line.quantity) : null;
        await tx.stock.update({ where: { variantId }, data: { onHand: { increment: line.quantity }, unitCostRial: nextCost, version: { increment: 1 } } });
        await tx.stockMovement.create({ data: { variantId, orderId: r.orderId, actorId, type: "RETURN", quantity: line.quantity, unitCostRial: cost, eventKey: `return:${id}:${line.orderItemId}`, reason: r.reason } });
        await tx.returnItem.update({ where: { returnId_orderItemId: { returnId: id, orderItemId: line.orderItemId } }, data: { restockable: true } });
      }
      status = "RECEIVED";
    } else {
      if (r.status !== "REQUESTED") throw new DomainError("INVALID_STATE", "این درخواست بررسی شده است.");
      status = d.action === "approve" ? "APPROVED" : "REJECTED";
      if (r.cancellation && status === "APPROVED") {
        if (r.order.shipments.some(s => ["SHIPPED","DELIVERED","RETURNED"].includes(s.status))) throw new DomainError("ALREADY_SHIPPED", "سفارش ارسال شده است؛ لغو مجاز نیست.");
        await tx.order.update({ where: { id: r.orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      }
    }
    const updated = await tx.returnRequest.update({ where: { id }, data: { status:status==="RECEIVED"&&r.refundLimitRial===0n?"RESOLVED":status, version: { increment: 1 } } });
    await event(tx, actorId, r.orderId, id, `return.${d.action}`);
    if (d.action === "reject") await tx.orderEvent.create({ data: { orderId: r.orderId, actorId, type: "return.rejected.reason", note: d.reason } });
    return updated;
  });
}
const refundSchema = z.object({ key: z.uuid(), amountRial: z.string().regex(/^\d{1,16}$/).refine(v => BigInt(v)>0n), destination: z.enum(["WALLET", "MANUAL"]), reason: z.string().trim().min(5).max(500) });
export async function requestRefund(db: PrismaClient, actorId: string, returnId: string, input: unknown) {
  const d = refundSchema.parse(input), amountRial = BigInt(d.amountRial);
  return db.$transaction(async tx => {
    await requirePermission(tx, actorId, "payments.refund");
    const found = await tx.returnRequest.findUnique({ where: { id: returnId } });
    if (!found) throw new DomainError("NOT_FOUND", "درخواست پیدا نشد.");
    await lock(tx, found.orderId);
    const r = await tx.returnRequest.findUniqueOrThrow({ where: { id: returnId }, include: { order: { include: { payments: { include: { refunds: true } } } }, refunds: true } });
    const old = await tx.refund.findUnique({ where: { idempotencyKey: d.key } });
    if (old) { if (old.returnId !== returnId || old.amountRial !== amountRial || old.destination !== d.destination || old.reason !== d.reason) throw new DomainError("IDEMPOTENCY_CONFLICT", "شناسهٔ تکراری با اطلاعات متفاوت."); return old; }
    if (!["RECEIVED", "RESOLVED"].includes(r.status)) throw new DomainError("INVALID_STATE", "ابتدا دریافت کالا و وضعیت برگشت به انبار را ثبت کنید.");
    const spent = r.refunds.filter(f => f.status !== "FAILED").reduce((sum,f) => sum+f.amountRial,0n);
    if (spent+amountRial > r.refundLimitRial) throw new DomainError("REFUND_LIMIT", "مبلغ از ماندهٔ قابل بازپرداخت بیشتر است.");
    const payment = r.order.payments.find(p => p.status === "SUCCEEDED" && p.amountRial-p.refunds.filter(f=>f.status!=="FAILED").reduce((s,f)=>s+f.amountRial,0n) >= amountRial);
    if (!payment) throw new DomainError("REFUND_LIMIT", "ماندهٔ پرداخت کافی نیست.");
    const refund = await tx.refund.create({ data: { paymentId: payment.id, returnId, idempotencyKey: d.key, amountRial, reason: d.reason, destination: d.destination } });
    await event(tx, actorId, r.orderId, returnId, "refund.requested");
    return refund;
  });
}
// MANUAL completion records verified bank evidence. No provider success is simulated.
export async function settleRefund(db: PrismaClient, actorId: string, id: string, input: unknown) {
  const d = z.object({ action: z.enum(["start", "complete", "fail"]), providerRef: z.string().trim().max(100).default("") }).parse(input);
  return db.$transaction(async tx => {
    await requirePermission(tx, actorId, "payments.refund");
    const found = await tx.refund.findUnique({ where: { id }, include: { payment: true } });
    if (!found) throw new DomainError("NOT_FOUND", "بازپرداخت پیدا نشد.");
    await lock(tx, found.payment.orderId);
    const f = await tx.refund.findUniqueOrThrow({ where: { id }, include: { payment: { include: { order: true } }, request: true } });
    if (f.status === "SUCCEEDED" && d.action === "complete") { if (f.destination === "MANUAL" && f.providerRef !== d.providerRef) throw new DomainError("IDEMPOTENCY_CONFLICT", "مرجع متفاوت است."); return f; }
    if (f.status === "FAILED" || f.status === "SUCCEEDED") throw new DomainError("INVALID_STATE", "بازپرداخت نهایی شده است.");
    if (d.action === "complete") {
      if (f.destination === "MANUAL" && (f.status !== "PROCESSING" || d.providerRef.length < 3)) throw new DomainError("EVIDENCE_REQUIRED", "ابتدا شروع عملیات و سپس مرجع بانکی تأییدشده را ثبت کنید.");
      if (f.destination === "WALLET") {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${f.payment.order.userId},33))`;
        await tx.walletEntry.create({ data: { userId: f.payment.order.userId, actorId, amountRial: f.amountRial, eventKey: `refund:${id}`, reason: f.reason } });
      }
    }
    const status = d.action === "start" ? "PROCESSING" : d.action === "complete" ? "SUCCEEDED" : "FAILED";
    if (d.action === "fail" && (f.status === "PROCESSING" && !d.providerRef)) throw new DomainError("EVIDENCE_REQUIRED", "برای آزادسازی مبلغ، نتیجهٔ عدم پرداخت را ثبت کنید.");
    const updated = await tx.refund.update({ where: { id }, data: { status, providerRef: d.providerRef || (f.destination === "WALLET" && status === "SUCCEEDED" ? `wallet:${id}` : null), completedAt: status === "SUCCEEDED" ? new Date() : null } });
    if (f.returnId && status === "SUCCEEDED") {
      const total = (await tx.refund.aggregate({ where: { returnId: f.returnId, status: "SUCCEEDED" }, _sum: { amountRial: true } }))._sum.amountRial??0n;
      if (total === f.request?.refundLimitRial) await tx.returnRequest.update({ where: { id: f.returnId }, data: { status: "RESOLVED", version: { increment: 1 } } });
    }
    await event(tx, actorId, f.payment.orderId, f.returnId??id, `refund.${d.action}`);
    return updated;
  });
}
