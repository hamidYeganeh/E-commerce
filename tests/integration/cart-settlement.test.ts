import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { seedFoundation } from "../../prisma/seed-data";
import { settlePurchasedCart, ownedCartSettlement } from "../../src/modules/checkout/cart-settlement";
import { saveCart, ownedCartWriteReceipt } from "../../src/modules/operations/engagement";
import { submitCheckout, verifyCheckout } from "../../src/modules/checkout/submit";
import type { PaymentProvider } from "../../src/modules/payments/provider";

let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
let ids: Awaited<ReturnType<typeof seedFoundation>>, sibling: string;
before(async () => {
  fixture = await createTestDatabase();
  ids = await seedFoundation(fixture.client);
  sibling = (await fixture.client.productVariant.create({ data: { productId: ids.productId, sku: randomUUID(), name: "Sibling", priceRial: 200n } })).id;
});
after(async () => fixture?.close());

async function buyer() { return fixture.client.user.create({ data: { name: "Cart settlement buyer" } }); }
async function order(userId: string, quantity = 2, paymentStatus: "SUCCEEDED" | "PENDING" | "NEEDS_REVIEW" | "FAILED" = "SUCCEEDED") {
  return fixture.client.order.create({ data: {
    userId, checkoutKey: randomUUID(), checkoutHash: "test", subtotalRial: 200n, totalRial: 200n,
    status: paymentStatus === "SUCCEEDED" ? "CONFIRMED" : "AWAITING_PAYMENT", expiresAt: new Date(Date.now() + 600000),
    items: { create: { variantId: ids.variantId, sku: "test", productName: "Honey", variantName: "Jar", attributesSnapshot: {}, quantity, unitPriceRial: 100n, totalRial: BigInt(quantity) * 100n } },
    payments: { create: { provider: "test", status: paymentStatus, amountRial: 200n, idempotencyKey: randomUUID() } },
  } });
}
function settle(item: Awaited<ReturnType<typeof order>>, quantity = 2, userId = item.userId) {
  return fixture.client.$transaction(tx => settlePurchasedCart(tx, { orderId: item.id, userId, checkoutKey: item.checkoutKey, lines: [{ variantId: ids.variantId, quantity }] }));
}

test("paid cart settlement preserves later extra quantities and sibling variants, exactly once", async () => {
  const user = await buyer(), item = await order(user.id);
  await saveCart(fixture.client, user.id, { lines: [{ variantId: ids.variantId, quantity: 5 }, { variantId: sibling, quantity: 3 }] });
  const before = await fixture.client.cart.findFirstOrThrow({ where: { userId: user.id } });
  const receipt = await settle(item);
  assert.deepEqual(receipt.remainingLines.sort((a, b) => a.variantId.localeCompare(b.variantId)), [{ variantId: ids.variantId, quantity: 3 }, { variantId: sibling, quantity: 3 }].sort((a, b) => a.variantId.localeCompare(b.variantId)));
  assert.equal(receipt.activityVersion, before.activityVersion + 1);
  assert.equal(receipt.checkoutKey, item.checkoutKey);
  assert.ok(!Number.isNaN(Date.parse(receipt.settledAt)));
  assert.deepEqual(await settle(item), receipt);
  assert.equal(await fixture.client.orderEvent.count({ where: { orderId: item.id, type: "cart.settled" } }), 1);
  assert.equal((await fixture.client.cart.findFirstOrThrow({ where: { userId: user.id } })).activityVersion, receipt.activityVersion);
});

test("pending, uncertain and failed payments never consume cart or issue receipt", async () => {
  for (const state of ["PENDING", "NEEDS_REVIEW", "FAILED"] as const) {
    const user = await buyer(), item = await order(user.id, 2, state);
    await saveCart(fixture.client, user.id, { lines: [{ variantId: ids.variantId, quantity: 2 }] });
    await assert.rejects(settle(item), { code: "CART_SETTLEMENT_INVALID" });
    assert.equal((await fixture.client.cartItem.findFirstOrThrow({ where: { cart: { userId: user.id } } })).quantity, 2);
    assert.equal(await ownedCartSettlement(fixture.client, user.id, item.checkoutKey), null);
  }
});

test("receipt ownership and exact purchased snapshots are enforced", async () => {
  const owner = await buyer(), other = await buyer(), item = await order(owner.id);
  await assert.rejects(settle(item, 1), { code: "CART_SETTLEMENT_INVALID" });
  await assert.rejects(settle(item, 2, other.id), { code: "CART_SETTLEMENT_INVALID" });
  const receipt = await settle(item);
  assert.equal(receipt.cartId, null);
  assert.equal(receipt.activityVersion, null);
  assert.deepEqual(await ownedCartSettlement(fixture.client, owner.id, item.checkoutKey), receipt);
  assert.equal(await ownedCartSettlement(fixture.client, other.id, item.checkoutKey), null);
});

test("stale browser writes cannot resurrect purchased items; versioned fresh edits remain allowed", async () => {
  const user = await buyer(), item = await order(user.id);
  const initial = await saveCart(fixture.client, user.id, { lines: [{ variantId: ids.variantId, quantity: 2 }], expectedActivityVersion: null });
  const receipt = await settle(item);
  await assert.rejects(saveCart(fixture.client, user.id, { lines: [{ variantId: ids.variantId, quantity: 2 }], expectedActivityVersion: initial.activityVersion }), { code: "CART_VERSION_CONFLICT" });
  await assert.rejects(saveCart(fixture.client, user.id, { lines: [], expectedActivityVersion: null }), { code: "CART_VERSION_CONFLICT" });
  assert.equal(await fixture.client.cartItem.count({ where: { cart: { userId: user.id } } }), 0);
  const edited = await saveCart(fixture.client, user.id, { lines: [{ variantId: sibling, quantity: 1 }], expectedActivityVersion: receipt.activityVersion });
  assert.equal(edited.activityVersion, receipt.activityVersion! + 1);
  assert.deepEqual(await settle(item), receipt);
  assert.equal((await fixture.client.cartItem.findFirstOrThrow({ where: { cart: { userId: user.id } } })).variantId, sibling);
});

test("cart mutation and receipt roll back together with failed settlement transaction", async () => {
  const user = await buyer(), item = await order(user.id);
  await saveCart(fixture.client, user.id, { lines: [{ variantId: ids.variantId, quantity: 2 }] });
  await assert.rejects(fixture.client.$transaction(async tx => {
    await settlePurchasedCart(tx, { orderId: item.id, userId: user.id, checkoutKey: item.checkoutKey, lines: [{ variantId: ids.variantId, quantity: 2 }] });
    throw new Error("ROLLBACK_SETTLEMENT");
  }), /ROLLBACK_SETTLEMENT/);
  assert.equal((await fixture.client.cartItem.findFirstOrThrow({ where: { cart: { userId: user.id } } })).quantity, 2);
  assert.equal(await ownedCartSettlement(fixture.client, user.id, item.checkoutKey), null);
});

test("actual bank and zero-total checkout paths issue cart receipts only after settlement", async () => {
  const db = fixture.client;
  await db.product.update({ where: { id: ids.productId }, data: { status: "ACTIVE", media: { create: { objectKey: "test.webp", alt: "Honey" } } } });
  await db.productVariant.update({ where: { id: ids.variantId }, data: { isActive: true, priceRial: 100n } });
  await db.stock.update({ where: { variantId: ids.variantId }, data: { onHand: 100, reserved: 0 } });
  const address = { recipientName: "نام آزمایشی", phoneNumber: "09123456789", province: "تهران", city: "تهران", addressLine: "نشانی آزمایشی شماره یک", postalCode: "1234567890" };
  const config = { shippingRial: 0n, callbackUrl: "https://example.test/callback" };
  for (const finalStatus of ["verified", "failed"] as const) {
    const user = await buyer();
    await db.user.update({ where: { id: user.id }, data: { phoneNumberVerified: true } });
    await saveCart(db, user.id, { lines: [{ variantId: ids.variantId, quantity: 3 }] });
    const authority = `A${randomUUID().replaceAll("-", "")}`;
    let outcome: "unknown" | "verified" | "failed" = "unknown";
    const provider: PaymentProvider = {
      redirect: value => `https://payment.zarinpal.com/pg/StartPay/${value}`,
      createPayment: async () => ({ authority, redirectUrl: `https://payment.zarinpal.com/pg/StartPay/${authority}` }),
      verifyPayment: async input => outcome === "verified" ? { status: "verified", transactionId: randomUUID(), amountRial: input.expectedAmountRial } : outcome === "failed" ? { status: "failed", code: "FAILED" } : { status: "unknown" },
    };
    const input = { key: randomUUID(), lines: [{ variantId: ids.variantId, quantity: 2 }], address, expectedTotalRial: "200" };
    await submitCheckout(db, user.id, input, provider, config);
    const now = new Date();
    await verifyCheckout(db, authority, provider, "zarinpal", now);
    assert.equal(await ownedCartSettlement(db, user.id, input.key), null);
    assert.equal((await db.cartItem.findFirstOrThrow({ where: { cart: { userId: user.id } } })).quantity, 3);
    outcome = finalStatus;
    await verifyCheckout(db, authority, provider, "zarinpal", new Date(now.getTime() + 61000));
    await verifyCheckout(db, authority, provider, "zarinpal", new Date(now.getTime() + 122000));
    assert.equal((await db.cartItem.findFirstOrThrow({ where: { cart: { userId: user.id } } })).quantity, finalStatus === "verified" ? 1 : 3);
    assert.equal(!!await ownedCartSettlement(db, user.id, input.key), finalStatus === "verified");
  }
  const freeUser = await buyer();
  await db.user.update({ where: { id: freeUser.id }, data: { phoneNumberVerified: true } });
  await saveCart(db, freeUser.id, { lines: [{ variantId: ids.variantId, quantity: 2 }] });
  await db.coupon.create({ data: { code: "CART-FREE", type: "PERCENTAGE", percentage: 100, isActive: true, startsAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() + 60000) } });
  const key = randomUUID();
  const unusedProvider: PaymentProvider = { redirect() { throw new Error("NO_BANK"); }, async createPayment() { throw new Error("NO_BANK"); }, async verifyPayment() { throw new Error("NO_BANK"); } };
  const free = await submitCheckout(db, freeUser.id, { key, lines: [{ variantId: ids.variantId, quantity: 2 }], address, couponCode: "CART-FREE", expectedTotalRial: "0" }, unusedProvider, config);
  assert.equal(free.settled, true);
  assert.equal(await db.cartItem.count({ where: { cart: { userId: freeUser.id } } }), 0);
  assert.ok(await ownedCartSettlement(db, freeUser.id, key));
});

test("lost cart-write response replays its receipt after later edits without restoring stale contents", async () => {
  const db = fixture.client, user = await buyer(), key = randomUUID();
  const initial = await saveCart(db, user.id, { lines: [{ variantId: ids.variantId, quantity: 1 }] });
  const request = { mutationKey: key, expectedOwner: user.id, expectedActivityVersion: initial.activityVersion, lines: [{ variantId: ids.variantId, quantity: 2 }] };
  const committed = await saveCart(db, user.id, request);
  // Simulate a dropped response followed by another browser's acknowledged edit.
  const latest = await saveCart(db, user.id, { lines: [{ variantId: ids.variantId, quantity: 4 }], expectedActivityVersion: committed.activityVersion });
  assert.deepEqual(await saveCart(db, user.id, request), committed);
  assert.equal((await db.cartItem.findFirstOrThrow({ where: { cart: { userId: user.id } } })).quantity, 4);
  assert.equal((await db.cart.findFirstOrThrow({ where: { userId: user.id } })).activityVersion, latest.activityVersion);
  assert.deepEqual(await ownedCartWriteReceipt(db, user.id, key), { key, activityVersion: committed.activityVersion });
  assert.equal(await db.cartWriteReceipt.count({ where: { userId: user.id, key } }), 1);
  await assert.rejects(saveCart(db, user.id, { ...request, lines: [{ variantId: ids.variantId, quantity: 3 }] }), { code: "CART_WRITE_CONFLICT" });
  await assert.rejects(saveCart(db, user.id, { ...request, expectedActivityVersion: latest.activityVersion }), { code: "CART_WRITE_CONFLICT" });
});

test("cart-write keys are owner scoped, stale owner rejected, and unchanged writes receive durable receipts", async () => {
  const db = fixture.client, first = await buyer(), second = await buyer(), key = randomUUID();
  const input = { mutationKey: key, expectedActivityVersion: null, lines: [{ variantId: ids.variantId, quantity: 1 }] };
  const saved = await saveCart(db, first.id, { ...input, expectedOwner: first.id });
  assert.equal(await ownedCartWriteReceipt(db, second.id, key), null);
  await assert.rejects(saveCart(db, second.id, { ...input, expectedOwner: first.id }), { code: "FORBIDDEN" });
  assert.equal(await db.cart.count({ where: { userId: second.id } }), 0);
  const own = await saveCart(db, second.id, { ...input, expectedOwner: second.id });
  assert.equal(own.activityVersion, saved.activityVersion);
  assert.equal(await db.cartWriteReceipt.count({ where: { key } }), 2);
  const unchangedKey = randomUUID();
  const unchanged = await saveCart(db, first.id, { ...input, mutationKey: unchangedKey, expectedActivityVersion: saved.activityVersion });
  assert.equal(unchanged.activityVersion, saved.activityVersion);
  assert.deepEqual(await ownedCartWriteReceipt(db, first.id, unchangedKey), { key: unchangedKey, activityVersion: saved.activityVersion });
  await assert.rejects(saveCart(db, first.id, { ...input, mutationKey: randomUUID(), expectedActivityVersion: undefined }));
  await db.user.delete({ where: { id: second.id } });
  assert.equal(await db.cartWriteReceipt.count({ where: { userId: second.id } }), 0);
});
