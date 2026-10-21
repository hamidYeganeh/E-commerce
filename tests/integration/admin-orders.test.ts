import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seedFoundation } from "../../prisma/seed-data";
import { createTestDatabase } from "../helpers/database";
import { listAdminOrders, getAdminOrder } from "../../src/modules/orders/admin-read";
let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
const staff: Record<string, string> = {};
let buyer: string, orderId: string, orderNumber: number;
before(async () => {
  fixture = await createTestDatabase();
  await seedFoundation(fixture.client);
  for (const key of ["owner", "finance", "warehouse", "support", "content"]) {
    const role = await fixture.client.role.findUniqueOrThrow({ where: { key } });
    staff[key] = (await fixture.client.user.create({ data: { name: key, roles: { create: { roleId: role.id } } } })).id;
  }
  buyer = (await fixture.client.user.create({ data: { name: "خریدار آزمایشی", phoneNumber: "+989121234567" } })).id;
  const order = await fixture.client.order.create({ data: {
    userId: buyer, checkoutKey: "checkout-secret", checkoutHash: "hash-secret", subtotalRial: 1000000n, totalRial: 1000000n, expiresAt: new Date(), customerNote: "private-note",
    createdAt: new Date("2026-10-18T20:30:00Z"),
    address: { create: { recipientName: "private-recipient", phoneNumber: "+989351234567", province: "private-province", city: "private-city", addressLine: "private-street", postalCode: "1234567890" } },
    payments: { create: { provider: "zarinpal", authority: "authority-secret", idempotencyKey: "idempotency-secret", amountRial: 1000000n, status: "NEEDS_REVIEW", failureCode: "RAW_PROVIDER_SECRET" } },
  } });
  orderId = order.id; orderNumber = order.number;
});
after(async () => fixture?.close());
const fa = (value: number) => String(value).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

test("only active staff with orders.read can cross list/detail interfaces", async () => {
  for (const actor of [buyer, staff.content, "missing"]) {
    await assert.rejects(listAdminOrders(fixture.client, actor, {}), { code: "FORBIDDEN" });
    await assert.rejects(getAdminOrder(fixture.client, actor, orderId), { code: "FORBIDDEN" });
  }
  await fixture.client.user.update({ where: { id: staff.support }, data: { disabledAt: new Date() } });
  await assert.rejects(getAdminOrder(fixture.client, staff.support, orderId), { code: "FORBIDDEN" });
  await fixture.client.user.update({ where: { id: staff.support }, data: { disabledAt: null } });
});

test("Persian/Arabic numbers and customer names find the order; no checkout internals returned", async () => {
  for (const q of [fa(orderNumber), String(orderNumber).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)]), "خریدار"]) {
    const result = await listAdminOrders(fixture.client, staff.owner, { q });
    assert.equal(result.orders[0].id, orderId); assert.equal(result.total, 1);
    const text = JSON.stringify(result, (_, v) => typeof v === "bigint" ? v.toString() : v);
    for (const secret of ["checkout-secret", "hash-secret", "authority-secret", "idempotency-secret", "private-street"]) assert.equal(text.includes(secret), false);
  }
});

test("phone search matches account or recipient snapshot and cannot be inferred without permission", async () => {
  for (const phone of ["۰۹۱۲۱۲۳۴۵۶۷", "00989121234567", "09351234567"]) {
    const result = await listAdminOrders(fixture.client, staff.support, { phone });
    assert.equal(result.total, 1); assert.equal(result.orders[0].id, orderId);
  }
  assert.equal((await listAdminOrders(fixture.client, staff.support, { phone: "09120000000" })).total, 0);
  for (const actor of [staff.finance, staff.warehouse]) await assert.rejects(listAdminOrders(fixture.client, actor, { phone: "09121234567" }), { code: "FORBIDDEN" });
  await assert.rejects(listAdminOrders(fixture.client, staff.support, { phone: "0912" }), { code: "INVALID_FILTERS" });
});

test("financial filter and payment projection require payments.read, address permission remains separate", async () => {
  for (const actor of [staff.support, staff.warehouse]) {
    await assert.rejects(listAdminOrders(fixture.client, actor, { payment: "review" }), { code: "FORBIDDEN" });
    assert.equal((await getAdminOrder(fixture.client, actor, orderId))?.payments, null);
  }
  for (const actor of [staff.owner, staff.finance]) {
    assert.equal((await listAdminOrders(fixture.client, actor, { payment: "review" })).total, 1);
    const detail = await getAdminOrder(fixture.client, actor, orderId);
    assert.equal(detail?.payments?.[0].status, "NEEDS_REVIEW");
    assert.equal(detail?.payments?.[0].reason, "uncertain");
    assert.equal(detail?.payments?.[0].amountRial, "1000000");
    const text = JSON.stringify(detail, (_, v) => typeof v === "bigint" ? v.toString() : v);
    for (const secret of ["authority-secret", "idempotency-secret", "checkout-secret", "hash-secret", "RAW_PROVIDER_SECRET"]) assert.equal(text.includes(secret), false);
    if (actor === staff.finance) {
      for (const secret of ["private-note", "private-recipient", "private-province", "private-city", "private-street", "+989351234567"]) assert.equal(text.includes(secret), false);
      assert.equal(detail?.address, undefined);
    }
  }
  assert.ok((await getAdminOrder(fixture.client, staff.warehouse, orderId))?.address);
  assert.equal(await getAdminOrder(fixture.client, staff.owner, "missing-order"), null);
});

test("Tehran calendar dates include midnight and the final millisecond, excluding next midnight", async () => {
  const db = fixture.client, token = randomUUID();
  const customer = await db.user.create({ data: { name: token } });
  const times = ["2026-10-18T20:29:59.999Z", "2026-10-18T20:30:00.000Z", "2026-10-19T20:29:59.999Z", "2026-10-19T20:30:00.000Z"];
  const ids: string[] = [];
  for (const time of times) ids.push((await db.order.create({ data: { userId: customer.id, checkoutKey: randomUUID(), checkoutHash: "fixture", subtotalRial: 10n, totalRial: 10n, expiresAt: new Date(), createdAt: new Date(time) } })).id);
  const [original] = await db.$queryRaw<{ zone: string }[]>`SELECT current_setting('TimeZone') AS zone`;
  try {
    for (const zone of ["UTC", "Asia/Tehran", "America/New_York"]) {
      await db.$queryRaw`SELECT set_config('TimeZone', ${zone}, false)`;
      const result = await listAdminOrders(db, staff.owner, { q: token, from: "۲۰۲۶-۱۰-۱۹", to: "2026-10-19" });
      assert.deepEqual(result.orders.map(o => o.id), [ids[2], ids[1]], zone);
      assert.equal(result.total, 2);
      assert.equal((await listAdminOrders(db, staff.owner, { q: token, from: "2026-10-20" })).total, 1);
      assert.equal((await listAdminOrders(db, staff.owner, { q: token, to: "2026-10-18" })).total, 1);
    }
  } finally { await db.$queryRaw`SELECT set_config('TimeZone', ${original.zone}, false)`; }
});

test("invalid enums, arrays, pagination and calendar ranges fail closed", async () => {
  for (const input of [{ status: "UNKNOWN" }, { payment: "succeeded" }, { from: "2026-02-30" }, { to: "not-date" }, { from: "2026-10-20", to: "2026-10-19" }, { q: ["a", "b"] }, { page: "0" }, { page: "100001" }, { page: "1x" }]) {
    await assert.rejects(listAdminOrders(fixture.client, staff.owner, input), { code: "INVALID_FILTERS" });
  }
});

test("status metrics retain non-status filters and stable pagination preserves same-time rows", async () => {
  const db = fixture.client, token = randomUUID();
  const customer = await db.user.create({ data: { name: token } });
  const time = new Date("2026-10-19T10:00:00Z");
  const ids: string[] = [];
  for (let i = 0; i < 21; i++) ids.push((await db.order.create({ data: { userId: customer.id, checkoutKey: randomUUID(), checkoutHash: "fixture", status: i === 0 ? "CONFIRMED" : "AWAITING_PAYMENT", subtotalRial: 10n, totalRial: 10n, expiresAt: time, createdAt: time } })).id);
  const filtered = await listAdminOrders(db, staff.owner, { q: token, status: "CONFIRMED", from: "2026-10-19" });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.counts.reduce((sum, c) => sum + c._count, 0), 21);
  const first = await listAdminOrders(db, staff.owner, { q: token });
  const next = await listAdminOrders(db, staff.owner, { q: token, page: "۲" });
  assert.deepEqual([...first.orders, ...next.orders].map(o => o.id), ids.sort().reverse());
  assert.equal(new Set([...first.orders, ...next.orders].map(o => o.id)).size, 21);
});

test("payment reasons and providers are allowlisted; no state changes happen on financial reads", async () => {
  const db = fixture.client;
  const original = await db.paymentAttempt.findFirstOrThrow({ where: { orderId } });
  await db.paymentAttempt.update({ where: { id: original.id }, data: { provider: "UNTRUSTED_PROVIDER_SECRET", failureCode: "MISSING_AUTHORITY_RECONCILE_MANUALLY", transactionId: "untrusted-ref" } });
  const before = await db.paymentAttempt.findUniqueOrThrow({ where: { id: original.id } });
  const detail = await getAdminOrder(db, staff.finance, orderId);
  assert.equal(detail?.payments?.[0].provider, "other");
  assert.equal(detail?.payments?.[0].reason, "manual");
  assert.equal(detail?.payments?.[0].transactionId, null);
  assert.deepEqual(await db.paymentAttempt.findUniqueOrThrow({ where: { id: original.id } }), before);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).version, 0);
  assert.equal(await db.stockMovement.count(), 0);
});
