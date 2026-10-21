import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seedFoundation } from "../../prisma/seed-data";
import { createTestDatabase } from "../helpers/database";
import { reserveStock, releaseOrderStock, consumeOrderStock } from "../../src/modules/inventory/reservations";

let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
let productId: string, customerId: string;
before(async () => {
  fixture = await createTestDatabase();
  productId = (await seedFoundation(fixture.client)).productId;
  customerId = (await fixture.client.user.create({ data: { name: "Reservation test customer" } })).id;
});
after(async () => fixture?.close());
async function variant(onHand = 5, prefix = "a") {
  const id = `${prefix}-${randomUUID()}`;
  return fixture.client.productVariant.create({ data: { id, productId, sku: id, name: "Test variant", priceRial: 1000n, stock: { create: { onHand } } } });
}
async function reservedOrder(lines: { variantId: string; quantity: number }[]) {
  return fixture.client.$transaction(async tx => {
    const expiresAt = new Date(Date.now() + 600000);
    const reservations = await reserveStock(tx, lines, expiresAt);
    return tx.order.create({ data: { userId: customerId, checkoutKey: randomUUID(), checkoutHash: "test", subtotalRial: 1000n, totalRial: 1000n, expiresAt, reservations: { create: reservations } } });
  });
}
async function payment(orderId: string) {
  return fixture.client.paymentAttempt.create({ data: { orderId, provider: "test", idempotencyKey: randomUUID(), amountRial: 1000n, status: "PENDING" } });
}

test("reserving multiple variants persists matching rows atomically with the Order", async () => {
  const a = await variant(), z = await variant(5, "z");
  const order = await reservedOrder([{ variantId: z.id, quantity: 3 }, { variantId: a.id, quantity: 2 }]);
  const rows = await fixture.client.stockReservation.findMany({ where: { orderId: order.id } });
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const stock = await fixture.client.stock.findUniqueOrThrow({ where: { variantId: row.variantId } });
    assert.equal(stock.reserved, row.quantity); assert.equal(stock.version, 1); assert.equal(stock.onHand, 5); assert.equal(row.status, "ACTIVE");
  }
});

test("a later unavailable variant rolls back earlier stock increments", async () => {
  const a = await variant(), z = await variant(0, "z");
  await assert.rejects(reservedOrder([{ variantId: z.id, quantity: 1 }, { variantId: a.id, quantity: 2 }]), { code: "INSUFFICIENT_STOCK" });
  assert.deepEqual(await fixture.client.stock.findUniqueOrThrow({ where: { variantId: a.id }, select: { reserved: true, version: true } }), { reserved: 0, version: 0 });
  assert.equal(await fixture.client.stockReservation.count({ where: { variantId: { in: [a.id, z.id] } } }), 0);
});

test("failed Order persistence rolls back its already-reserved stock", async () => {
  const item = await variant();
  await assert.rejects(fixture.client.$transaction(async tx => {
    const expiresAt = new Date(Date.now() + 600000);
    const rows = await reserveStock(tx, [{ variantId: item.id, quantity: 2 }], expiresAt);
    await tx.order.create({ data: { userId: "nonexistent-customer", checkoutKey: randomUUID(), checkoutHash: "test", subtotalRial: 1000n, totalRial: 1000n, expiresAt, reservations: { create: rows } } });
  }));
  assert.equal((await fixture.client.stock.findUniqueOrThrow({ where: { variantId: item.id } })).reserved, 0);
  assert.equal(await fixture.client.stockReservation.count({ where: { variantId: item.id } }), 0);
});

test("release is idempotent, preserves onHand and forbids later consumption", async () => {
  const item = await variant(), order = await reservedOrder([{ variantId: item.id, quantity: 2 }]);
  const attempt = await payment(order.id);
  assert.equal(await fixture.client.$transaction(tx => releaseOrderStock(tx, order.id)), 1);
  assert.equal(await fixture.client.$transaction(tx => releaseOrderStock(tx, order.id)), 0);
  const stock = await fixture.client.stock.findUniqueOrThrow({ where: { variantId: item.id } });
  assert.equal(stock.onHand, 5); assert.equal(stock.reserved, 0); assert.equal(stock.version, 2);
  await assert.rejects(fixture.client.$transaction(tx => consumeOrderStock(tx, order.id, attempt.id)), { code: "STOCK_CONFLICT" });
  assert.equal(await fixture.client.stockMovement.count({ where: { orderId: order.id } }), 0);
});

test("consumption is idempotent, writes one sale and cannot be released afterward", async () => {
  const item = await variant(), order = await reservedOrder([{ variantId: item.id, quantity: 2 }]);
  const attempt = await payment(order.id);
  assert.equal(await fixture.client.$transaction(tx => consumeOrderStock(tx, order.id, attempt.id)), 1);
  assert.equal(await fixture.client.$transaction(tx => consumeOrderStock(tx, order.id, attempt.id)), 0);
  const stock = await fixture.client.stock.findUniqueOrThrow({ where: { variantId: item.id } });
  assert.equal(stock.onHand, 3); assert.equal(stock.reserved, 0); assert.equal(stock.version, 2);
  const movements = await fixture.client.stockMovement.findMany({ where: { orderId: order.id } });
  assert.equal(movements.length, 1); assert.equal(movements[0].quantity, -2); assert.equal(movements[0].eventKey, `payment:${attempt.id}:${item.id}`);
  await assert.rejects(fixture.client.$transaction(tx => releaseOrderStock(tx, order.id)), { code: "STOCK_CONFLICT" });
});

test("a later settlement conflict rolls back stock, statuses and sale movements", async () => {
  const a = await variant(), z = await variant(5, "z");
  const order = await reservedOrder([{ variantId: a.id, quantity: 1 }, { variantId: z.id, quantity: 1 }]);
  const attempt = await payment(order.id);
  // Simulate inconsistent persisted stock without breaking the SQL stock bounds.
  await fixture.client.stock.update({ where: { variantId: z.id }, data: { reserved: 0 } });
  for (const consume of [false, true]) {
    await assert.rejects(fixture.client.$transaction(tx => consume ? consumeOrderStock(tx, order.id, attempt.id) : releaseOrderStock(tx, order.id)), { code: "STOCK_CONFLICT" });
    const first = await fixture.client.stock.findUniqueOrThrow({ where: { variantId: a.id } });
    assert.equal(first.reserved, 1); assert.equal(first.onHand, 5); assert.equal(first.version, 1);
    assert.equal(await fixture.client.stockReservation.count({ where: { orderId: order.id, status: "ACTIVE" } }), 2);
    assert.equal(await fixture.client.stockMovement.count({ where: { orderId: order.id } }), 0);
  }
});

test("consumption rejects another Order's payment without changing stock", async () => {
  const a = await variant(), z = await variant();
  const first = await reservedOrder([{ variantId: a.id, quantity: 1 }]), other = await reservedOrder([{ variantId: z.id, quantity: 1 }]);
  const foreign = await payment(other.id);
  await assert.rejects(fixture.client.$transaction(tx => consumeOrderStock(tx, first.id, foreign.id)), { code: "STOCK_CONFLICT" });
  assert.equal((await fixture.client.stock.findUniqueOrThrow({ where: { variantId: a.id } })).reserved, 1);
});

test("invalid reservation quantities or duplicate variants never mutate stock", async () => {
  const item = await variant();
  for (const lines of [[], [{ variantId: item.id, quantity: 0 }], [{ variantId: item.id, quantity: 1.5 }], [{ variantId: item.id, quantity: 1 }, { variantId: item.id, quantity: 1 }]]) {
    await assert.rejects(fixture.client.$transaction(tx => reserveStock(tx, lines, new Date())), { code: "INVALID_RESERVATION" });
  }
  assert.equal((await fixture.client.stock.findUniqueOrThrow({ where: { variantId: item.id } })).version, 0);
});
