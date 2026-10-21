import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "../helpers/database";
import { seedFoundation } from "../../prisma/seed-data";
import { createCategory, createTag, moveCategory } from "../../src/modules/catalog/service";
import { processOutboxEvent } from "../../src/workers/outbox";

let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
let ids: Awaited<ReturnType<typeof seedFoundation>>;
let ownerId: string;

before(async () => {
  fixture = await createTestDatabase();
  ids = await seedFoundation(fixture.client);
  const role = await fixture.client.role.findUniqueOrThrow({ where: { key: "owner" } });
  const owner = await fixture.client.user.create({ data: { name: "Test owner", roles: { create: { roleId: role.id } } } });
  ownerId = owner.id;
});
after(async () => { await fixture?.close(); });

test("migrations and seed create a draft multi-category catalog, and re-seeding preserves edits", async () => {
  const db = fixture.client;
  const product = await db.product.findUniqueOrThrow({ where: { id: ids.productId }, include: { categories: true, tags: true } });
  assert.equal(product.status, "DRAFT");
  assert.equal(product.categories.filter((category) => category.isPrimary).length, 1);
  assert.equal(product.tags.length, 2);
  assert.equal(await db.userRole.count(), 1); // Only the test-created owner; seed grants no staff access.
  await db.productVariant.update({ where: { id: ids.variantId }, data: { priceRial: 24000000n } });
  await db.stock.update({ where: { variantId: ids.variantId }, data: { onHand: 10 } });
  await seedFoundation(db);
  assert.equal(await db.product.count(), 1);
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).onHand, 10);
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: ids.variantId } })).priceRial, 24000000n);
});

test("catalog writes check permission and rejected category cycles leave no partial audit", async () => {
  const db = fixture.client;
  const customer = await db.user.create({ data: { name: "Customer" } });
  await assert.rejects(createCategory(db, customer.id, { name: "Forbidden", slug: "forbidden" }), { code: "FORBIDDEN" });
  assert.equal(await db.category.count({ where: { slug: "forbidden" } }), 0);
  const food = await db.category.findUniqueOrThrow({ where: { slug: "food" } });
  const honey = await db.category.findUniqueOrThrow({ where: { slug: "honey" } });
  const beforeAudit = await db.auditLog.count();
  await assert.rejects(moveCategory(db, ownerId, food.id, honey.id), { code: "CATEGORY_CYCLE" });
  assert.equal(await db.auditLog.count(), beforeAudit);
  const newCategory = await createCategory(db, ownerId, { name: "دمنوش", slug: "herbal-tea", parentId: food.id });
  assert.equal(newCategory.parentId, food.id);
  assert.equal(await db.auditLog.count(), beforeAudit + 1);
});

test("normalized Persian tags cannot be duplicated with Arabic spelling", async () => {
  const db = fixture.client;
  await createTag(db, ownerId, { name: "كيك خانگي", slug: "homemade-cake" });
  await assert.rejects(createTag(db, ownerId, { name: "کیک خانگی", slug: "another-cake" }), { code: "P2002" });
});

test("SQL rejects over-reservation and a second primary category", async () => {
  const db = fixture.client;
  await assert.rejects(db.stock.update({ where: { variantId: ids.variantId }, data: { reserved: 11 } }));
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).reserved, 0);
  const food = await db.category.findUniqueOrThrow({ where: { slug: "food" } });
  await assert.rejects(db.productCategory.create({ data: { productId: ids.productId, categoryId: food.id, isPrimary: true } }), { code: "P2002" });
  await db.productCategory.create({ data: { productId: ids.productId, categoryId: food.id } });
});

test("SQL rejects nonmatching attribute options and ownerless carts", async () => {
  const db = fixture.client;
  const attribute = await db.attribute.create({ data: { name: "رنگ", key: "color", type: "SELECT", options: { create: { value: "amber", label: "کهربایی" } } }, include: { options: true } });
  const weight = await db.attribute.findUniqueOrThrow({ where: { key: "net-weight" } });
  await assert.rejects(db.variantAttributeValue.update({
    where: { variantId_attributeId: { variantId: ids.variantId, attributeId: weight.id } },
    data: { optionId: attribute.options[0].id, value: null },
  }), { code: "P2003" });
  await assert.rejects(db.cart.create({ data: {} }));
});

test("order snapshots survive catalog changes and checkout keys are unique", async () => {
  const db = fixture.client;
  const order = await db.order.create({ data: {
    userId: ownerId, checkoutKey: "test-checkout", checkoutHash: "same-body",
    expiresAt: new Date(Date.now() + 600000), subtotalRial: 24000000n, totalRial: 24000000n,
    address: { create: { recipientName: "Test", phoneNumber: "+989120000000", province: "Test", city: "Test", addressLine: "Test", postalCode: "0000000000" } },
    items: { create: { variantId: ids.variantId, productName: "Original product", variantName: "900g", sku: "DRBIZ-HONEY-900", attributesSnapshot: { weight: 900 }, quantity: 1, unitPriceRial: 24000000n, totalRial: 24000000n } },
  } });
  await db.product.update({ where: { id: ids.productId }, data: { name: "Changed catalog name" } });
  assert.equal((await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).productName, "Original product");
  await assert.rejects(db.order.create({ data: { userId: ownerId, checkoutKey: "test-checkout", checkoutHash: "another-body", expiresAt: new Date(), subtotalRial: 1n, totalRial: 1n } }), { code: "P2002" });
  await assert.rejects(db.order.update({ where: { id: order.id }, data: { totalRial: 1n } }));
});

test("outbox writes roll back with the transaction and ping processing is repeatable", async () => {
  const db = fixture.client;
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.outboxEvent.create({ data: { topic: "system.ping", aggregateId: "rollback", payload: {} } });
    throw new Error("Rollback");
  }));
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: "rollback" } }), 0);
  const event = await db.outboxEvent.create({ data: { topic: "system.ping", aggregateId: "foundation", payload: {} } });
  await processOutboxEvent(db, event.id);
  const processed = await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
  await processOutboxEvent(db, event.id);
  assert.ok(processed.processedAt);
  assert.deepEqual((await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).processedAt, processed.processedAt);
  const unsupported = await db.outboxEvent.create({ data: { topic: "sms.send", aggregateId: "foundation", payload: {} } });
  await assert.rejects(processOutboxEvent(db, unsupported.id), /UNSUPPORTED_EVENT_TOPIC/);
  assert.equal((await db.outboxEvent.findUniqueOrThrow({ where: { id: unsupported.id } })).processedAt, null);
});
