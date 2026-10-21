import {cartDiscount,allocateDiscount} from "./discounts";
import {notifyOrder} from "../operations/notifications";
import { resolveShipping } from "../operations/commerce";
import { purchasePolicy } from "../catalog/purchase-policy";
import { reserveStock, releaseOrderStock, consumeOrderStock } from "../inventory/reservations";
import { canContinuePayment } from "./continuation";
import { settlePurchasedCart } from "./cart-settlement";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { DomainError } from "../../shared/domain-error";
import { addressSchema, cartLinesSchema } from "./contracts";
import { calculateTotals } from "./pricing";
import { getLookups, productInclude, publicProduct, visibleCategoryIds } from "../catalog/repository";
import type { PaymentProvider } from "../payments/provider";

export const checkoutSchema = z.object({ key: z.uuid(), lines: cartLinesSchema, address: addressSchema, expectedTotalRial: z.string().regex(/^\d{1,15}$/), shippingMethodId: z.string().max(100).optional(), couponCode: z.string().trim().max(40).optional(), giftMessage:z.string().trim().max(500).default(""),gatewayId:z.string().max(150).optional() });
// Provider/config are injected so tests never contact a bank or simulate payment in production.
export async function submitCheckout(db: PrismaClient, userId: string, input: unknown, provider: PaymentProvider, config: { shippingRial: bigint; callbackUrl: string; providerName?: string }) {
  const data = checkoutSchema.parse(input);
  const canonical = { lines: [...data.lines].sort((a, b) => a.variantId.localeCompare(b.variantId)), address: data.address, expectedTotalRial: data.expectedTotalRial, giftMessage:data.giftMessage, ...(data.shippingMethodId ? {shippingMethodId:data.shippingMethodId}:{}), ...(data.couponCode?{couponCode:data.couponCode}: {}),...(data.gatewayId?{gatewayId:data.gatewayId}:{}) };
  const hash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  const providerName = config.providerName ?? "zarinpal";
  const attempt = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.key}, 3))`;
    const old = await tx.order.findUnique({ where: { checkoutKey: data.key }, include: { payments: true, reservations: true } });
    if (old) {
      if (old.userId !== userId || old.checkoutHash !== hash) throw new DomainError("IDEMPOTENCY_CONFLICT", "این درخواست قبلاً با اطلاعات دیگری استفاده شده است.");
      const saved = old.payments.find(p => p.idempotencyKey === data.key);
      if(saved?.provider==="coupon"&&saved.status==="SUCCEEDED"&&old.totalRial===0n)return{payment:saved,replay:true,settled:true};
      if (canContinuePayment(old, saved, providerName)) return { payment: saved!, replay: true };
      throw new DomainError("PAYMENT_IN_PROGRESS", "این درخواست قبلاً ثبت شده است. نتیجه را در سفارش‌های من بررسی کنید و دوباره پرداخت نکنید.");
    }
    const user = await tx.user.findFirst({ where: { id: userId, disabledAt: null, phoneNumberVerified: true } });
    if (!user) throw new DomainError("VERIFIED_PHONE_REQUIRED", "ابتدا با شمارهٔ موبایل تأییدشده وارد شوید.");
    // Serialize a customer's fresh keys as well as a single key's replay.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 4))`;
    const unfinished = await tx.order.findFirst({ where: { userId, status: "AWAITING_PAYMENT", payments: { some: { status: { in: ["PENDING", "NEEDS_REVIEW"] } } } }, select: { id: true } });
    if (unfinished) throw new DomainError("ACTIVE_CHECKOUT_EXISTS", "یک پرداخت در جریان دارید؛ ابتدا نتیجهٔ آن را در سفارش‌های من بررسی کنید.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(140017,1)`;
    const lookups = await getLookups(tx);
    const policy = purchasePolicy(visibleCategoryIds(lookups.categories));
    const snapshots = [];
    for (const line of canonical.lines) {
      const v = await tx.productVariant.findUnique({ where: { id: line.variantId }, include: { stock: true, product: { include: productInclude } } });
      if (!policy.allowsVariant(v)) throw new DomainError("PRODUCT_UNAVAILABLE", "یکی از محصولات دیگر قابل خرید نیست.");
      const projection = publicProduct(v.product, lookups);
      snapshots.push({ variantId: v.id, productName: v.product.name, variantName: v.name, sku: v.sku, attributesSnapshot: [...projection.attributes, ...(projection.variants.find(item => item.id === v.id)?.attributes ?? [])], quantity: line.quantity, unitPriceRial: v.priceRial, totalRial: v.priceRial * BigInt(line.quantity), netWeightGrams: v.netWeightGrams, shippingWeightGrams: v.shippingWeightGrams });
    }
    const expiresAt = new Date(Date.now() + 30 * 60000);
    const reservations = await reserveStock(tx, canonical.lines, expiresAt);
    const subtotal=snapshots.reduce((sum,item)=>sum+item.totalRial,0n);
    const shipping=await resolveShipping(tx,data.shippingMethodId,data.address,subtotal,snapshots,config.shippingRial);
    const coupon=await cartDiscount(tx,userId,data.couponCode,subtotal,snapshots,true);
    const totals = calculateTotals(snapshots, coupon.discount, shipping.fee);
    if (totals.totalRial.toString() !== data.expectedTotalRial) throw new DomainError("PRICE_CHANGED", "قیمت یا هزینهٔ ارسال تغییر کرده است؛ سبد را دوباره بررسی کنید.");
    const discountedSnapshots=allocateDiscount(snapshots,coupon.discount,coupon.eligibleIds);
    const free=totals.totalRial===0n;
    const order = await tx.order.create({ data: { userId, checkoutKey: data.key, checkoutHash: hash, ...totals, expiresAt, address: { create: data.address }, giftMessage:data.giftMessage||null, items: { create: discountedSnapshots }, reservations: { create: reservations }, events: { create: { type: "checkout.created" } }, payments: { create: { provider: free?"coupon":providerName, amountRial: totals.totalRial, idempotencyKey: data.key, status: free?"SUCCEEDED":"PENDING",...(free?{verifiedAt:new Date(),transactionId:data.key}:{}) } } }, include: { payments: true } });
    await notifyOrder(tx,order.id,"order.created");
    if(coupon.bundleId)await tx.orderEvent.create({data:{orderId:order.id,type:"bundle.selected",data:{bundleId:coupon.bundleId}}});
    if(coupon.couponId)await tx.couponRedemption.create({data:{couponId:coupon.couponId,orderId:order.id}});
    await tx.orderEvent.create({data:{orderId:order.id,type:"shipping.selected",data:{name:shipping.name,methodId:data.shippingMethodId??null}}});
    if(free){await consumeOrderStock(tx,order.id,order.payments[0].id);await tx.couponRedemption.updateMany({where:{orderId:order.id},data:{status:"CONSUMED"}});await tx.order.update({where:{id:order.id},data:{status:"CONFIRMED",confirmedAt:new Date(),version:{increment:1}}});await tx.orderEvent.create({data:{orderId:order.id,type:"coupon.settled"}});await notifyOrder(tx,order.id,"order.paid");}
    if (free) await settlePurchasedCart(tx, { orderId: order.id, userId, checkoutKey: data.key, lines: canonical.lines });
    return { payment: order.payments[0], replay: false,settled:free };
  }, { timeout: 15000 });
  const { payment } = attempt;
  if(attempt.settled)return{orderId:payment.orderId,redirectUrl:"",settled:true};
  if (attempt.replay) return { orderId: payment.orderId, redirectUrl: provider.redirect(payment.authority!) };
  try {
    const created = await provider.createPayment({ paymentId: payment.id, amountRial: payment.amountRial, callbackUrl: config.callbackUrl, idempotencyKey: data.key });
    await db.paymentAttempt.update({ where: { id: payment.id }, data: { authority: created.authority } });
    return { orderId: payment.orderId, redirectUrl: created.redirectUrl };
  } catch (error) {
    if (error instanceof DomainError && error.code === "PAYMENT_REQUEST_REJECTED") {
      await db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payment.orderId}, 2))`;
        const current = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: payment.id }, include: { order: { include: { reservations: true } } } });
        if (current.authority || current.status !== "PENDING" || current.order.status !== "AWAITING_PAYMENT") throw new DomainError("PAYMENT_NEEDS_REVIEW", "نتیجهٔ پرداخت نیاز به بررسی دارد.");
        await releaseOrderStock(tx, current.orderId);
        await tx.couponRedemption.updateMany({where:{orderId:current.orderId,status:"RESERVED"},data:{status:"RELEASED"}});
        await tx.paymentAttempt.update({ where: { id: current.id }, data: { status: "FAILED", failureCode: "REQUEST_REJECTED" } });
        await tx.order.update({ where: { id: current.orderId }, data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 } } });
        await tx.orderEvent.create({ data: { orderId: current.orderId, type: "payment.rejected" } });
      });
      throw error;
    }
    // Unknown upstream outcomes need reconciliation; never release potentially paid stock.
    await db.paymentAttempt.update({ where: { id: payment.id }, data: { status: "NEEDS_REVIEW", failureCode: "REQUEST_UNCERTAIN" } });
    throw new DomainError("PAYMENT_NEEDS_REVIEW", "پاسخ درگاه مشخص نیست. سفارش در حساب شما ثبت شده؛ پیش از پرداخت مجدد نتیجه را بررسی کنید.");
  }
}

export async function verifyCheckout(db: PrismaClient, authority: string, provider: PaymentProvider, providerName = "zarinpal", now = new Date()) {
  const payment = await db.paymentAttempt.findUnique({ where: { provider_authority: { provider: providerName, authority } } });
  if (!payment) throw new DomainError("NOT_FOUND", "پرداخت پیدا نشد.");
  if (payment.status === "SUCCEEDED") return { orderId: payment.orderId, status: "verified" };
  if (payment.status === "FAILED") return { orderId: payment.orderId, status: "failed" };
  // Every caller (public callback, customer recovery and worker) shares this
  // short claim. The bank's two 15-second requests stay outside the transaction.
  // A crashed/uncertain request can retry after a minute without releasing stock.
  const claim = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payment.orderId}, 2))`;
    const current = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: payment.id } });
    if (current.status === "SUCCEEDED") return "verified";
    if (current.status === "FAILED") return "failed";
    const recent = await tx.paymentEvent.findFirst({ where: { paymentId: payment.id, type: "verification.claimed", createdAt: { gt: new Date(now.getTime() - 60_000) } } });
    if (recent) return "review";
    await tx.paymentEvent.create({ data: { paymentId: payment.id, eventKey: randomUUID(), type: "verification.claimed", createdAt: now } });
    return "claimed";
  });
  if (claim !== "claimed") return { orderId: payment.orderId, status: claim };
  const verified = await provider.verifyPayment({ authority, expectedAmountRial: payment.amountRial });
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payment.orderId}, 2))`;
    const current = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: payment.id }, include: { order: { include: { reservations: true } } } });
    if (current.status === "SUCCEEDED") return { orderId: current.orderId, status: "verified" };
    if (current.status === "FAILED") return { orderId: current.orderId, status: "failed" };
    if (verified.status === "failed" && current.order.status === "AWAITING_PAYMENT") {
      await releaseOrderStock(tx, current.orderId);
      await tx.couponRedemption.updateMany({where:{orderId:current.orderId,status:"RESERVED"},data:{status:"RELEASED"}});
      await tx.paymentAttempt.update({ where: { id: current.id }, data: { status: "FAILED", failureCode: verified.code } });
      await tx.order.update({ where: { id: current.orderId }, data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 } } });
      await tx.orderEvent.create({ data: { orderId: current.orderId, type: "payment.failed" } });
      return { orderId: current.orderId, status: "failed" };
    }
    if (verified.status !== "verified" || verified.amountRial !== current.amountRial || current.order.status !== "AWAITING_PAYMENT" || current.order.reservations.some(r => r.status !== "ACTIVE")) {
      await tx.paymentAttempt.update({ where: { id: current.id }, data: { status: "NEEDS_REVIEW" } });
      return { orderId: current.orderId, status: "review" };
    }
    await consumeOrderStock(tx, current.orderId, current.id);
    await tx.couponRedemption.updateMany({where:{orderId:current.orderId,status:"RESERVED"},data:{status:"CONSUMED"}});
    await tx.paymentAttempt.update({ where: { id: current.id }, data: { status: "SUCCEEDED", transactionId: verified.transactionId, verifiedAt: new Date() } });
    await settlePurchasedCart(tx, { orderId: current.orderId, userId: current.order.userId, checkoutKey: current.order.checkoutKey, lines: current.order.reservations.map(r => ({ variantId: r.variantId, quantity: r.quantity })) });
    await tx.order.update({ where: { id: current.orderId }, data: { status: "CONFIRMED", confirmedAt: new Date(), version: { increment: 1 } } });
    await tx.orderEvent.create({ data: { orderId: current.orderId, type: "payment.verified" } });
    await notifyOrder(tx,current.orderId,"order.paid");
    return { orderId: current.orderId, status: "verified" };
  });
}
