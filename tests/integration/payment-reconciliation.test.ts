import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { seedFoundation } from "../../prisma/seed-data";
import { reconcilePaymentBatch } from "../../src/modules/payments/reconciliation";
import { reserveStock } from "../../src/modules/inventory/reservations";
import { verifyCheckout } from "../../src/modules/checkout/submit";
import type { PaymentProvider } from "../../src/modules/payments/provider";
let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
let productId: string, userId: string;
const now = new Date();
const old = new Date(now.getTime() - 3600_000);
before(async () => {
  fixture = await createTestDatabase();
  productId = (await seedFoundation(fixture.client)).productId;
  userId = (await fixture.client.user.create({ data: { name: "Reconciliation fixture" } })).id;
});
after(async () => fixture?.close());
async function pending(provider: string, options: { authority?: boolean; recent?: boolean; expired?: boolean; status?: "PENDING" | "NEEDS_REVIEW" | "SUCCEEDED" | "FAILED" } = {}) {
  const db = fixture.client, key = randomUUID();
  const variant = await db.productVariant.create({ data: { productId, sku: key, name: "test", priceRial: 1000n, stock: { create: { onHand: 3 } } } });
  const expiresAt = options.expired === false ? new Date(now.getTime() + 3600_000) : old;
  const order = await db.$transaction(async tx => {
    const reservations = await reserveStock(tx, [{ variantId: variant.id, quantity: 1 }], expiresAt);
    return tx.order.create({ data: { userId, checkoutKey: key, checkoutHash: "fixture", subtotalRial: 1000n, totalRial: 1000n, expiresAt, items: { create: { variantId: variant.id, sku: variant.sku, productName: "Fixture", variantName: variant.name, attributesSnapshot: {}, quantity: 1, unitPriceRial: 1000n, totalRial: 1000n } }, reservations: { create: reservations }, payments: { create: { provider, authority: options.authority === false ? null : `A${key.replaceAll("-", "")}`, idempotencyKey: key, amountRial: 1000n, status: options.status ?? "PENDING", updatedAt: options.recent ? now : old } } }, include: { payments: true } });
  });
  return { order, payment: order.payments[0], variant };
}
function provider(verifyPayment: PaymentProvider["verifyPayment"]): PaymentProvider {
  return { redirect() { throw new Error("No redirect in reconciliation"); }, async createPayment() { throw new Error("No new invoice in reconciliation"); }, verifyPayment };
}
async function retained(s: Awaited<ReturnType<typeof pending>>) {
  const db = fixture.client;
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: s.variant.id } })).reserved, 1);
  assert.equal((await db.stockReservation.findFirstOrThrow({ where: { orderId: s.order.id } })).status, "ACTIVE");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: s.order.id } })).status, "AWAITING_PAYMENT");
  assert.equal(await db.stockMovement.count({ where: { orderId: s.order.id } }), 0);
}

test("one failing attempt does not block other settlements and is delayed before retry", async () => {
  const name = randomUUID(), failed = await pending(name), good = await pending(name), rejected = await pending(name);
  let calls = 0;
  const p = provider(async input => {
    calls++;
    if (input.authority === failed.payment.authority) throw new Error("provider secret must not be logged");
    if (input.authority === rejected.payment.authority) return { status: "failed", code: "FAILED" };
    return { status: "verified", transactionId: randomUUID(), amountRial: input.expectedAmountRial };
  });
  assert.deepEqual(await reconcilePaymentBatch(fixture.client, p, name, now), { checked: 3, verified: 1, failed: 1, review: 0, errors: 1 });
  await retained(failed);
  assert.equal((await fixture.client.order.findUniqueOrThrow({ where: { id: good.order.id } })).status, "CONFIRMED");
  assert.equal((await fixture.client.order.findUniqueOrThrow({ where: { id: rejected.order.id } })).status, "CANCELLED");
  assert.equal((await fixture.client.stock.findUniqueOrThrow({ where: { variantId: rejected.variant.id } })).reserved, 0);
  assert.equal((await reconcilePaymentBatch(fixture.client, p, name, now)).checked, 0);
  assert.equal(calls, 3);
  assert.equal((await reconcilePaymentBatch(fixture.client, p, name, new Date(now.getTime() + 16 * 60_000))).errors, 1);
  assert.equal(calls, 4);
});

test("unknown results and missing authority retain stock; timeout alone never cancels", async () => {
  const name = randomUUID(), unknown = await pending(name), missing = await pending(name, { authority: false });
  let calls = 0;
  const result = await reconcilePaymentBatch(fixture.client, provider(async () => { calls++; return { status: "unknown" }; }), name, now);
  assert.deepEqual(result, { checked: 2, verified: 0, failed: 0, review: 2, errors: 0 });
  assert.equal(calls, 1);
  for (const s of [unknown, missing]) {
    await retained(s);
    assert.equal((await fixture.client.paymentAttempt.findUniqueOrThrow({ where: { id: s.payment.id } })).status, "NEEDS_REVIEW");
  }
  assert.equal((await fixture.client.paymentAttempt.findUniqueOrThrow({ where: { id: missing.payment.id } })).failureCode, "MISSING_AUTHORITY_RECONCILE_MANUALLY");
});

test("provider, retry age, expiry and terminal payment status limit discovery", async () => {
  const name = randomUUID();
  await pending(randomUUID());
  await pending(name, { recent: true });
  await pending(name, { expired: false });
  await pending(name, { status: "SUCCEEDED" });
  await pending(name, { status: "FAILED" });
  const s = await pending(name);
  await fixture.client.order.update({ where: { id: s.order.id }, data: { status: "CANCELLED" } });
  const result = await reconcilePaymentBatch(fixture.client, provider(async () => { throw new Error("Must not call provider"); }), name, now);
  assert.deepEqual(result, { checked: 0, verified: 0, failed: 0, review: 0, errors: 0 });
});

test("overlapping batches claim a retry once while a callback can settle idempotently", async () => {
  const name = randomUUID(), s = await pending(name);
  let start!: () => void, resume!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  const gate = new Promise<void>(resolve => { resume = resolve; });
  let calls = 0;
  const p = provider(async input => {
    calls++; start(); await gate;
    return { status: "verified", transactionId: "race-fixture", amountRial: input.expectedAmountRial };
  });
  const first = reconcilePaymentBatch(fixture.client, p, name, now);
  await started;
  try {
    assert.equal((await reconcilePaymentBatch(fixture.client, p, name, now)).checked, 0);
    let duplicateCalls = 0;
    const duplicate = provider(async input => { duplicateCalls++; return { status: "verified", transactionId: "race-fixture", amountRial: input.expectedAmountRial }; });
    const callbacks = await Promise.all(Array.from({ length: 12 }, () => verifyCheckout(fixture.client, s.payment.authority!, duplicate, name, now)));
    assert.ok(callbacks.every(result => result.status === "review"));
    assert.equal(duplicateCalls, 0);
  } finally { resume(); }
  assert.equal((await first).verified, 1); assert.equal(calls, 1);
  assert.equal(await fixture.client.stockMovement.count({ where: { orderId: s.order.id } }), 1);
  const stock = await fixture.client.stock.findUniqueOrThrow({ where: { variantId: s.variant.id } });
  assert.equal(stock.onHand, 2); assert.equal(stock.reserved, 0);
});

test("verification cooldown survives unknown results and exceptions, then allows safe retry", async () => {
  for (const throws of [false, true]) {
    const name = randomUUID(), s = await pending(name);
    let calls = 0;
    const p = provider(async input => {
      calls++;
      if (calls === 1) { if (throws) throw new Error("transport lost"); return { status: "unknown" }; }
      return { status: "verified", transactionId: randomUUID(), amountRial: input.expectedAmountRial };
    });
    const first = verifyCheckout(fixture.client, s.payment.authority!, p, name, now);
    if (throws) await assert.rejects(first); else assert.equal((await first).status, "review");
    await retained(s);
    assert.equal((await verifyCheckout(fixture.client, s.payment.authority!, p, name, new Date(now.getTime() + 59_999))).status, "review");
    assert.equal(calls, 1);
    assert.equal((await verifyCheckout(fixture.client, s.payment.authority!, p, name, new Date(now.getTime() + 60_000))).status, "verified");
    assert.equal(calls, 2);
    assert.equal((await verifyCheckout(fixture.client, s.payment.authority!, p, name)).status, "verified");
    assert.equal(calls, 2);
    assert.equal(await fixture.client.stockMovement.count({ where: { orderId: s.order.id } }), 1);
  }
});

test("a failed page cannot starve later due attempts beyond the batch limit", async () => {
  const name = randomUUID();
  for (let i = 0; i < 11; i++) await pending(name);
  let calls = 0;
  const p = provider(async () => { calls++; throw new Error("unavailable"); });
  assert.equal((await reconcilePaymentBatch(fixture.client, p, name, now)).checked, 10);
  assert.equal((await reconcilePaymentBatch(fixture.client, p, name, now)).checked, 1);
  assert.equal((await reconcilePaymentBatch(fixture.client, p, name, now)).checked, 0);
  assert.equal(calls, 11);
});
