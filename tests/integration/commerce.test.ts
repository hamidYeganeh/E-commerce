import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { seedFoundation } from "../../prisma/seed-data";
import { quoteCart } from "../../src/modules/checkout/quote";
import { addressSchema, cartLinesSchema } from "../../src/modules/checkout/contracts";
import { manageOrder } from "../../src/modules/orders/management";
import { submitCheckout, verifyCheckout } from "../../src/modules/checkout/submit";
import type { PaymentProvider } from "../../src/modules/payments/provider";
let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
let ids: Awaited<ReturnType<typeof seedFoundation>>;
let owner: string, customer: string;
before(async () => {
  fixture = await createTestDatabase(); ids = await seedFoundation(fixture.client);
  const role = await fixture.client.role.findUniqueOrThrow({ where: { key: "owner" } });
  owner = (await fixture.client.user.create({ data: { name: "Test owner", roles: { create: { roleId: role.id } } } })).id;
  customer = (await fixture.client.user.create({ data: { name: "Test customer" } })).id;
});
after(async () => fixture?.close());
async function order(status: "AWAITING_PAYMENT" | "CONFIRMED" = "AWAITING_PAYMENT") {
  return fixture.client.order.create({ data: { userId: customer, status, checkoutKey: randomUUID(), checkoutHash: "test", subtotalRial: 10000n, totalRial: 10000n, expiresAt: new Date(Date.now() + 600000), items: { create: { variantId: ids.variantId, productName: "Test product", variantName: "Test variant", sku: "test", attributesSnapshot: {}, quantity: 1, unitPriceRial: 10000n, totalRial: 10000n } } } });
}
test("cart rejects duplicates, excessive quantities, and accepts Persian address digits", () => {
  assert.equal(cartLinesSchema.safeParse([{ variantId: "a", quantity: 21 }]).success, false);
  assert.equal(cartLinesSchema.safeParse([{ variantId: "a", quantity: 1 }, { variantId: "a", quantity: 1 }]).success, false);
  const result = addressSchema.parse({ recipientName: "نام نمونه", phoneNumber: "۰۹۱۲۱۲۳۴۵۶۷", province: "تهران", city: "تهران", addressLine: "نشانی نمونه برای آزمون", postalCode: "۱۲۳۴۵۶۷۸۹۰" });
  assert.equal(result.postalCode, "1234567890"); assert.equal(result.phoneNumber, "+989121234567");
});
test("quote excludes drafts, recalculates server price and rejects unavailable quantity", async () => {
  const db = fixture.client;
  assert.equal((await quoteCart(db, [{ variantId: ids.variantId, quantity: 1 }])).valid, false);
  await db.product.update({ where: { id: ids.productId }, data: { status: "ACTIVE", media: { create: { objectKey: "test.webp", alt: "test" } } } });
  await db.productVariant.update({ where: { id: ids.variantId }, data: { isActive: true, priceRial: 10000n } });
  await db.stock.update({ where: { variantId: ids.variantId }, data: { onHand: 3 } });
  const quote = await quoteCart(db, [{ variantId: ids.variantId, quantity: 2, priceRial: "1" }]);
  assert.equal(quote.valid, true); assert.equal(quote.subtotalRial, "20000"); assert.equal(quote.paymentEnabled, false);
  assert.equal((await quoteCart(db, [{ variantId: ids.variantId, quantity: 4 }])).valid, false);
  await db.product.update({ where: { id: ids.productId }, data: { status: "ARCHIVED" } });
  assert.equal((await quoteCart(db, [{ variantId: ids.variantId, quantity: 1 }])).items[0].product, null);
});
test("admin cancellation checks permissions/version and releases reservations exactly once", async () => {
  const db = fixture.client, item = await order();
  await db.stock.update({ where: { variantId: ids.variantId }, data: { reserved: 1 } });
  await db.stockReservation.create({ data: { orderId: item.id, variantId: ids.variantId, quantity: 1, expiresAt: item.expiresAt } });
  await assert.rejects(manageOrder(db, customer, item.id, { action: "cancel", version: 0, note: "test" }), { code: "FORBIDDEN" });
  await assert.rejects(manageOrder(db, owner, item.id, { action: "cancel", version: 3, note: "test" }), { code: "VERSION_CONFLICT" });
  const result = await manageOrder(db, owner, item.id, { action: "cancel", version: 0, note: "test" });
  assert.equal(result.status, "CANCELLED");
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).reserved, 0);
  await assert.rejects(manageOrder(db, owner, item.id, { action: "cancel", version: 0, note: "test" }), { code: "VERSION_CONFLICT" });
  assert.equal(await db.orderEvent.count({ where: { orderId: item.id } }), 1);
});
test("pending or paid payments cannot be cancelled through unpaid-order action", async () => {
  const db = fixture.client, item = await order();
  await db.paymentAttempt.create({ data: { orderId: item.id, provider: "test", idempotencyKey: randomUUID(), amountRial: item.totalRial, status: "SUCCEEDED", verifiedAt: new Date() } });
  await assert.rejects(manageOrder(db, owner, item.id, { action: "cancel", version: 0, note: "test" }), { code: "REFUND_REVIEW_REQUIRED" });
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: item.id } })).status, "AWAITING_PAYMENT");
});
test("full shipment advances only a processed order and completion requires delivery", async () => {
  const db = fixture.client, item = await order("CONFIRMED");
  await assert.rejects(manageOrder(db, owner, item.id, { action: "ship", version: 0, carrier: "test", trackingNumber: "test" }), { code: "INVALID_SHIPMENT" });
  await manageOrder(db, owner, item.id, { action: "process", version: 0 });
  await manageOrder(db, owner, item.id, { action: "ship", version: 1, carrier: "test", trackingNumber: "test" });
  const shipment = await db.shipment.findFirstOrThrow({ where: { orderId: item.id } });
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: item.id } })).status, "PROCESSING");
  await assert.rejects(manageOrder(db, owner, item.id, { action: "deliver", version: 2, shipmentId: "wrong" }), { code: "INVALID_SHIPMENT" });
  await manageOrder(db, owner, item.id, { action: "deliver", version: 2, shipmentId: shipment.id });
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: item.id } })).status, "COMPLETED");
});

test("checkout snapshots price, rolls back stale totals and verifies stock consumption once", async () => {
  const db = fixture.client;
  await db.user.update({ where: { id: customer }, data: { phoneNumber: "+989121234567", phoneNumberVerified: true } });
  await db.product.update({ where: { id: ids.productId }, data: { status: "ACTIVE" } });
  await db.stock.update({ where: { variantId: ids.variantId }, data: { onHand: 3, reserved: 0 } });
  const authority = "A" + randomUUID().replaceAll("-", "");
  const provider: PaymentProvider = { redirect(authority) { return `https://payment.zarinpal.com/pg/StartPay/${authority}`; }, async createPayment() { return { authority, redirectUrl: `https://payment.zarinpal.com/pg/StartPay/${authority}` }; }, async verifyPayment(input) { return { status: "verified", transactionId: "123456", amountRial: input.expectedAmountRial }; } };
  const input = { key: randomUUID(), lines: [{ variantId: ids.variantId, quantity: 2 }], address: { recipientName: "نام نمونه", phoneNumber: "09121234567", province: "تهران", city: "تهران", addressLine: "نشانی آزمون شماره یک", postalCode: "1234567890" }, expectedTotalRial: "20500" };
  const config = { shippingRial: 500n, callbackUrl: "https://example.test/callback" };
  await assert.rejects(submitCheckout(db, customer, { ...input, expectedTotalRial: "1" }, provider, config), { code: "PRICE_CHANGED" });
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).reserved, 0);
  const submitted = await submitCheckout(db, customer, input, provider, config);
  assert.deepEqual(await submitCheckout(db, customer, input, provider, config), submitted);
  await db.productVariant.update({ where: { id: ids.variantId }, data: { priceRial: 30000n } });
  await verifyCheckout(db, authority, provider); await verifyCheckout(db, authority, provider);
  const saved = await db.order.findUniqueOrThrow({ where: { id: submitted.orderId }, include: { items: true } });
  assert.equal(saved.status, "CONFIRMED"); assert.equal(saved.items[0].unitPriceRial, 10000n);
  const stock = await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } });
  assert.equal(stock.onHand, 1); assert.equal(stock.reserved, 0);
  assert.equal(await db.stockMovement.count({ where: { orderId: saved.id, type: "SALE" } }), 1);
});
test("uncertain payment retains stock; definitive provider failure releases it once", async () => {
  const db = fixture.client;
  await db.productVariant.update({ where: { id: ids.variantId }, data: { priceRial: 10000n } });
  await db.stock.update({ where: { variantId: ids.variantId }, data: { onHand: 3, reserved: 0 } });
  const authority = "A" + randomUUID().replaceAll("-", "");
  let outcome: "unknown" | "failed" = "unknown";
  const provider: PaymentProvider = { redirect(authority) { return `https://payment.zarinpal.com/pg/StartPay/${authority}`; }, async createPayment() { return { authority, redirectUrl: `https://payment.zarinpal.com/pg/StartPay/${authority}` }; }, async verifyPayment() { return outcome === "unknown" ? { status: "unknown" } : { status: "failed", code: "FAILED" }; } };
  const submitted = await submitCheckout(db, customer, { key: randomUUID(), lines: [{ variantId: ids.variantId, quantity: 1 }], address: { recipientName: "نام نمونه", phoneNumber: "09121234567", province: "تهران", city: "تهران", addressLine: "نشانی آزمون شماره دو", postalCode: "1234567890" }, expectedTotalRial: "10500" }, provider, { shippingRial: 500n, callbackUrl: "https://example.test/callback" });
  await verifyCheckout(db, authority, provider);
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).reserved, 1);
  outcome = "failed"; await verifyCheckout(db, authority, provider, "zarinpal", new Date(Date.now() + 61_000)); await verifyCheckout(db, authority, provider);
  const stock = await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } });
  assert.equal(stock.onHand, 3); assert.equal(stock.reserved, 0);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: submitted.orderId } })).status, "CANCELLED");
});
test("definitive payment request rejection cancels and releases reservations", async () => {
  const { DomainError } = await import("../../src/shared/domain-error");
  const db = fixture.client;
  const provider: PaymentProvider = { redirect(authority) { return `https://payment.zarinpal.com/pg/StartPay/${authority}`; }, async createPayment() { throw new DomainError("PAYMENT_REQUEST_REJECTED", "Rejected"); }, async verifyPayment() { return { status: "unknown" }; } };
  const key = randomUUID();
  await assert.rejects(submitCheckout(db, customer, { key, lines: [{ variantId: ids.variantId, quantity: 1 }], address: { recipientName: "نام نمونه", phoneNumber: "09121234567", province: "تهران", city: "تهران", addressLine: "نشانی آزمون شماره سه", postalCode: "1234567890" }, expectedTotalRial: "10500" }, provider, { shippingRial: 500n, callbackUrl: "https://example.test/callback" }), { code: "PAYMENT_REQUEST_REJECTED" });
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).reserved, 0);
  assert.equal((await db.order.findUniqueOrThrow({ where: { checkoutKey: key } })).status, "CANCELLED");
});

test("lost checkout response reuses one invoice and owned recovery rejects unsafe continuations", async () => {
  const { recoverCustomerPayment } = await import("../../src/modules/checkout/recovery");
  const db = fixture.client;
  const buyer = await db.user.create({ data: { name: "Recovery buyer", phoneNumber: "+989123456781", phoneNumberVerified: true } });
  await db.stock.update({ where: { variantId: ids.variantId }, data: { onHand: 3, reserved: 0 } });
  let creates = 0, verifies = 0;
  const authority = "A" + randomUUID().replaceAll("-", "");
  const provider: PaymentProvider = {
    redirect(value) { return `https://payment.zarinpal.com/pg/StartPay/${value}`; },
    async createPayment() { creates++; return { authority, redirectUrl: this.redirect(authority) }; },
    async verifyPayment(input) { verifies++; return { status: "verified", transactionId: randomUUID(), amountRial: input.expectedAmountRial }; },
  };
  const input = { key: randomUUID(), lines: [{ variantId: ids.variantId, quantity: 1 }], address: { recipientName: "نام نمونه", phoneNumber: "09123456781", province: "تهران", city: "تهران", addressLine: "نشانی بازیابی پرداخت", postalCode: "1234567890" }, expectedTotalRial: "10500" };
  const config = { shippingRial: 500n, callbackUrl: "https://example.test/callback" };
  const options = { providerName: "zarinpal", continuationEnabled: true };
  const first = await submitCheckout(db, buyer.id, input, provider, config);
  // A price change after checkout must not change an existing invoice or reserve again.
  await db.productVariant.update({ where: { id: ids.variantId }, data: { priceRial: 50000n } });
  assert.deepEqual(await submitCheckout(db, buyer.id, input, provider, config), first);
  assert.equal(creates, 1);
  assert.equal(await db.order.count({ where: { userId: buyer.id } }), 1);
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).reserved, 1);
  await assert.rejects(submitCheckout(db, buyer.id, { ...input, expectedTotalRial: "2" }, provider, config), { code: "IDEMPOTENCY_CONFLICT" });
  await assert.rejects(submitCheckout(db, customer, input, provider, config), { code: "IDEMPOTENCY_CONFLICT" });
  await assert.rejects(submitCheckout(db, buyer.id, { ...input, key: randomUUID() }, provider, config), { code: "ACTIVE_CHECKOUT_EXISTS" });
  await assert.rejects(recoverCustomerPayment(db, customer, first.orderId, "check", provider, options), { code: "NOT_FOUND" });
  assert.equal(verifies, 0);
  assert.equal((await recoverCustomerPayment(db, buyer.id, first.orderId, "continue", provider, options)).status, "continue");
  await assert.rejects(recoverCustomerPayment(db, buyer.id, first.orderId, "continue", provider, { ...options, continuationEnabled: false }), { code: "PAYMENT_NOT_CONFIGURED" });
  await assert.rejects(recoverCustomerPayment(db, buyer.id, first.orderId, "continue", provider, { ...options, providerName: "zarinpal-sandbox" }), { code: "PAYMENT_CANNOT_CONTINUE" });
  await db.order.update({ where: { id: first.orderId }, data: { expiresAt: new Date(0) } });
  await assert.rejects(recoverCustomerPayment(db, buyer.id, first.orderId, "continue", provider, options), { code: "PAYMENT_CANNOT_CONTINUE" });
  // Expiration blocks handoff, but a verified late result can still safely consume active reservations.
  assert.equal((await recoverCustomerPayment(db, buyer.id, first.orderId, "check", provider, options)).status, "verified");
  assert.equal((await recoverCustomerPayment(db, buyer.id, first.orderId, "check", provider, options)).status, "verified");
  assert.equal(verifies, 1);
  assert.equal(creates, 1);
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).onHand, 2);
  assert.equal(await db.stockMovement.count({ where: { orderId: first.orderId } }), 1);
  await assert.rejects(recoverCustomerPayment(db, buyer.id, first.orderId, "continue", provider, options), { code: "PAYMENT_CANNOT_CONTINUE" });
});

test("unknown or missing-authority attempts cannot be continued and keep reservations", async () => {
  const { recoverCustomerPayment } = await import("../../src/modules/checkout/recovery");
  const db = fixture.client;
  const buyer = await db.user.create({ data: { name: "Uncertain buyer", phoneNumber: "+989123456782", phoneNumberVerified: true } });
  await db.stock.update({ where: { variantId: ids.variantId }, data: { onHand: 3, reserved: 0 } });
  await db.productVariant.update({ where: { id: ids.variantId }, data: { priceRial: 10000n } });
  let creates = 0;
  const provider: PaymentProvider = { redirect() { throw new Error("Must not redirect"); }, async createPayment() { creates++; throw new Error("Lost upstream response"); }, async verifyPayment() { throw new Error("No authority to verify"); } };
  const key = randomUUID();
  const input = { key, lines: [{ variantId: ids.variantId, quantity: 1 }], address: { recipientName: "نام نمونه", phoneNumber: "09123456782", province: "تهران", city: "تهران", addressLine: "نشانی پرداخت نامشخص", postalCode: "1234567890" }, expectedTotalRial: "10500" };
  const config = { shippingRial: 500n, callbackUrl: "https://example.test/callback" };
  await assert.rejects(submitCheckout(db, buyer.id, input, provider, config), { code: "PAYMENT_NEEDS_REVIEW" });
  const saved = await db.order.findUniqueOrThrow({ where: { checkoutKey: key } });
  const options = { providerName: "zarinpal", continuationEnabled: true };
  assert.equal((await recoverCustomerPayment(db, buyer.id, saved.id, "check", provider, options)).status, "review");
  await assert.rejects(recoverCustomerPayment(db, buyer.id, saved.id, "continue", provider, options), { code: "PAYMENT_CANNOT_CONTINUE" });
  await assert.rejects(submitCheckout(db, buyer.id, input, provider, config), { code: "PAYMENT_IN_PROGRESS" });
  assert.equal(creates, 1);
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).reserved, 1);
});
