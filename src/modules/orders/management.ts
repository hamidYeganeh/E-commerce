import {notifyOrder} from "../operations/notifications";
import { releaseOrderStock } from "../inventory/reservations";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { DomainError } from "../../shared/domain-error";
import { requirePermission } from "../identity/authorization";
import { assertOrderTransition } from "./policy";

const actionSchema = z.object({
  action: z.enum(["process", "cancel", "note", "pack", "ship", "deliver"]),
  version: z.number().int().min(0),
  note: z.string().trim().max(1000).default(""),
  carrier: z.string().trim().max(100).default(""),
  trackingNumber: z.string().trim().max(100).default(""),
  items: z.array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(1) })).min(1).max(100).optional(),
  shipmentId: z.string().max(100).optional(),
});

export async function manageOrder(db: PrismaClient, actorId: string, orderId: string, input: unknown) {
  const data = actionSchema.parse(input);
  const permission = data.action === "note" ? "orders.notes" : data.action === "cancel" ? "orders.cancel" : ["pack", "ship", "deliver"].includes(data.action) ? "shipments.write" : "orders.process";
  return db.$transaction(async tx => {
    await requirePermission(tx, actorId, permission);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${orderId}, 2))`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, reservations: true, payments: true, shipments: { include: { items: true } }, returns: true } });
    if (!order) throw new DomainError("NOT_FOUND", "سفارش پیدا نشد.");
    if (order.version !== data.version) throw new DomainError("VERSION_CONFLICT", "سفارش تغییر کرده است؛ صفحه را تازه کنید.");
    let status = order.status;
    const extra: { cancelledAt?: Date } = {};
    if (data.action === "note") {
      if (!data.note) throw new DomainError("NOTE_REQUIRED", "متن یادداشت را وارد کنید.");
    } else if (data.action === "process") {
      assertOrderTransition(status, "PROCESSING");
      status = "PROCESSING";
      await notifyOrder(tx,orderId,"order.confirmed");
    } else if (data.action === "cancel") {
      // Paid orders must enter an explicit refund flow; this action cannot silently discard funds.
      if (order.payments.some(p => ["SUCCEEDED", "NEEDS_REVIEW", "PENDING"].includes(p.status)) || order.status !== "AWAITING_PAYMENT") throw new DomainError("REFUND_REVIEW_REQUIRED", "لغو فقط برای سفارش پرداخت‌نشده و بدون تراکنش در جریان مجاز است.");
      assertOrderTransition(status, "CANCELLED", { anyShipped: order.shipments.some(s => ["SHIPPED", "DELIVERED", "RETURNED"].includes(s.status)) });
      if (!data.note) throw new DomainError("NOTE_REQUIRED", "دلیل لغو را بنویسید.");
      await releaseOrderStock(tx, orderId);
      await tx.couponRedemption.updateMany({ where: { orderId, status: "RESERVED" }, data: { status: "RELEASED" } });
      status = "CANCELLED"; extra.cancelledAt = new Date();
    } else if (data.action === "pack" || data.action === "ship") {
      if(status!=="PROCESSING" || order.returns.some(r=>["REQUESTED","APPROVED"].includes(r.status)))throw new DomainError("INVALID_SHIPMENT","سفارش در حال آماده‌سازی و بدون مرجوعی باز لازم است.");
      const packed=data.shipmentId?order.shipments.find(s=>s.id===data.shipmentId&&s.status==="PACKED"):undefined;
      if(data.shipmentId&&!packed)throw new DomainError("INVALID_SHIPMENT","مرسولهٔ آماده پیدا نشد.");
      const selected=packed?.items??data.items??order.items.map(i=>({orderItemId:i.id,quantity:i.quantity-order.shipments.flatMap(s=>s.items).filter(l=>l.orderItemId===i.id).reduce((n,l)=>n+l.quantity,0)})).filter(i=>i.quantity>0);
      if(!selected.length||new Set(selected.map(i=>i.orderItemId)).size!==selected.length)throw new DomainError("INVALID_SHIPMENT","اقلام ارسال را انتخاب کنید.");
      for(const line of selected){const item=order.items.find(i=>i.id===line.orderItemId);const assigned=order.shipments.filter(s=>s.id!==packed?.id).flatMap(s=>s.items).filter(l=>l.orderItemId===line.orderItemId).reduce((n,l)=>n+l.quantity,0);if(!item||line.quantity<1||assigned+line.quantity>item.quantity)throw new DomainError("SHIPMENT_QUANTITY","تعداد ارسال بیش از ماندهٔ سفارش است.");}
      if(data.action==="ship"&&(!data.carrier||!data.trackingNumber))throw new DomainError("INVALID_SHIPMENT","شرکت حمل و رهگیری لازم است.");
      const shipmentData=data.action==="ship"?{status:"SHIPPED" as const,carrier:data.carrier,trackingNumber:data.trackingNumber,shippedAt:new Date()}:{status:"PACKED" as const};
      if(packed)await tx.shipment.update({where:{id:packed.id},data:shipmentData});
      else await tx.shipment.create({data:{orderId,...shipmentData,items:{create:selected.map(i=>({orderItemId:i.orderItemId,quantity:i.quantity}))}}});
      if(data.action==="ship")await notifyOrder(tx,orderId,"order.shipped");
    } else if (data.action === "deliver") {
      const shipment = order.shipments.find(s => s.id === data.shipmentId && s.status === "SHIPPED");
      if (status !== "PROCESSING" || !shipment) throw new DomainError("INVALID_SHIPMENT", "مرسولهٔ ارسال‌شده پیدا نشد.");
      const delivered = order.shipments.filter(s => s.status === "DELIVERED" || s.id === shipment.id);
      const allDelivered = order.items.length > 0 && order.items.every(i => delivered.flatMap(s => s.items).filter(s => s.orderItemId === i.id).reduce((sum, s) => sum + s.quantity, 0) === i.quantity);
      await tx.shipment.update({ where: { id: shipment.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
      if (allDelivered) { assertOrderTransition(status, "COMPLETED", { allDelivered }); status = "COMPLETED"; }
    }
    const updated = await tx.order.updateMany({ where: { id: orderId, version: data.version }, data: { status, ...extra, version: { increment: 1 } } });
    if (updated.count !== 1) throw new DomainError("VERSION_CONFLICT", "سفارش هم‌زمان تغییر کرده است.");
    await tx.orderEvent.create({ data: { orderId, actorId, type: `admin.${data.action}`, note: data.note || null, data: { from: order.status, to: status, ...(data.action === "ship" ? { carrier: data.carrier, trackingNumber: data.trackingNumber } : {}) } } });
    await tx.auditLog.create({ data: { actorId, entityType: "Order", entityId: orderId, action: `order.${data.action}`, changes: { from: order.status, to: status } } });
    return { id: orderId, status, version: data.version + 1 };
  });
}
