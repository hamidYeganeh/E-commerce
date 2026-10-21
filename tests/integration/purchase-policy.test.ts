import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { getPublicProduct, listPublicProducts } from "../../src/modules/catalog/repository";
import { quoteCart } from "../../src/modules/checkout/quote";
import { submitCheckout } from "../../src/modules/checkout/submit";
import type { PaymentProvider } from "../../src/modules/payments/provider";

let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
before(async () => { fixture = await createTestDatabase(); });
after(async () => { await fixture?.close(); });
const address = { recipientName: "نام نمونه", phoneNumber: "09121234567", province: "تهران", city: "تهران", addressLine: "نشانی نمونه برای آزمون", postalCode: "1234567890" };
const config = { shippingRial: 500n, callbackUrl: "https://example.test/callback" };

async function sample() {
  const db = fixture.client, key = randomUUID();
  const parent = await db.category.create({ data: { name: key, slug: `parent-${key}` } });
  const child = await db.category.create({ data: { name: key, slug: `child-${key}`, parentId: parent.id } });
  const product = await db.product.create({ data: {
    name: key, slug: key, status: "ACTIVE",
    categories: { create: { categoryId: child.id, isPrimary: true } },
    media: { create: { objectKey: "fixture.webp", alt: "test" } },
    variants: { create: { name: "test", sku: key, isActive: true, priceRial: 1000n, stock: { create: { onHand: 3 } } } },
  }, include: { variants: true } });
  const user = await db.user.create({ data: { name: "Test customer", phoneNumberVerified: true } });
  const variant = product.variants[0];
  const input = { key, lines: [{ variantId: variant.id, quantity: 1 }], address, expectedTotalRial: "1500" };
  let requests = 0;
  const provider: PaymentProvider = {
    redirect: authority => `https://payment.zarinpal.com/pg/StartPay/${authority}`,
    async createPayment() { requests++; const authority = `A${key.replaceAll("-", "")}`; return { authority, redirectUrl: this.redirect(authority) }; },
    async verifyPayment() { throw new Error("Verification is outside this test"); },
  };
  return { product, parent, child, variant, user, input, provider, requests: () => requests };
}
type Sample = Awaited<ReturnType<typeof sample>>;

async function check(s: Sample, visible: boolean, error?: string) {
  const db = fixture.client;
  const detail = await getPublicProduct(db, s.product.slug);
  const listing = await listPublicProducts(db, { q: s.product.name });
  assert.equal(!!detail, visible, "Prisma detail eligibility");
  assert.equal(listing.total, visible ? 1 : 0, "SQL listing eligibility");
  assert.equal(listing.items.length, visible ? 1 : 0, "runtime listing eligibility");
  const quote = await quoteCart(db, s.input.lines);
  assert.equal(quote.valid, !error, "quote eligibility");
  if (error) {
    await assert.rejects(submitCheckout(db, s.user.id, s.input, s.provider, config), { code: error });
    assert.equal(s.requests(), 0, "no provider call after rejection");
    assert.equal(await db.order.count({ where: { userId: s.user.id } }), 0);
    assert.equal(await db.paymentAttempt.count({ where: { order: { userId: s.user.id } } }), 0);
    assert.equal(await db.stockReservation.count({ where: { variantId: s.variant.id } }), 0);
    assert.equal(await db.stockMovement.count({ where: { variantId: s.variant.id } }), 0);
    assert.equal((await db.stock.findUnique({ where: { variantId: s.variant.id } }))?.reserved ?? 0, 0);
    if (error === "PRODUCT_UNAVAILABLE") assert.equal(quote.items[0].product, null);
  } else {
    assert.equal(quote.subtotalRial, "1000");
    const order = await submitCheckout(db, s.user.id, s.input, s.provider, config);
    assert.ok(order.orderId); assert.equal(s.requests(), 1);
    assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: s.variant.id } })).reserved, 1);
  }
  return detail;
}

test("eligible product crosses listing, detail, quote and submission interfaces", async () => {
  await check(await sample(), true);
});

const rejected = [
  "draft", "archived", "no media", "no primary", "no categories", "inactive category", "inactive ancestor", "inactive secondary", "inactive variant", "no variants",
] as const;
for (const scenario of rejected) test(`all purchase paths reject ${scenario}`, async () => {
  const s = await sample(), db = fixture.client;
  switch (scenario) {
    case "draft": case "archived": await db.product.update({ where: { id: s.product.id }, data: { status: scenario === "draft" ? "DRAFT" : "ARCHIVED" } }); break;
    case "no media": await db.productMedia.deleteMany({ where: { productId: s.product.id } }); break;
    case "no primary": await db.productCategory.updateMany({ where: { productId: s.product.id }, data: { isPrimary: false } }); break;
    case "no categories": await db.productCategory.deleteMany({ where: { productId: s.product.id } }); break;
    case "inactive category": case "inactive ancestor": await db.category.update({ where: { id: scenario === "inactive category" ? s.child.id : s.parent.id }, data: { isActive: false } }); break;
    case "inactive secondary": await db.productCategory.create({ data: { product: { connect: { id: s.product.id } }, category: { create: { name: "inactive", slug: randomUUID(), isActive: false } } } }); break;
    case "inactive variant": await db.productVariant.update({ where: { id: s.variant.id }, data: { isActive: false } }); break;
    case "no variants": await db.stock.delete({ where: { variantId: s.variant.id } }); await db.productVariant.delete({ where: { id: s.variant.id } }); break;
  }
  await check(s, false, "PRODUCT_UNAVAILABLE");
});

test("valid sibling keeps product public but cannot authorize the selected inactive free variant", async () => {
  const s = await sample(), db = fixture.client;
  await db.productVariant.update({ where: { id: s.variant.id }, data: { isActive: false, priceRial: 0n } });
  const sibling = await db.productVariant.create({ data: { productId: s.product.id, name: "valid sibling", sku: randomUUID(), priceRial: 2000n, isActive: true } });
  const detail = await check(s, true, "PRODUCT_UNAVAILABLE");
  assert.deepEqual(detail?.variants.map(v => v.id), [sibling.id]);
  assert.deepEqual((await listPublicProducts(db, { q: s.product.name })).items[0].variants.map(v => v.id), [sibling.id]);
});

for (const scenario of ["empty", "fully reserved", "missing"] as const) test(`${scenario} stock stays visible but cannot be purchased`, async () => {
  const s = await sample(), db = fixture.client;
  if (scenario === "missing") await db.stock.delete({ where: { variantId: s.variant.id } });
  else await db.stock.update({ where: { variantId: s.variant.id }, data: scenario === "empty" ? { onHand: 0 } : { reserved: 3 } });
  const detail = await getPublicProduct(db, s.product.slug);
  assert.equal(detail?.variants[0].available, false);
  assert.equal((await listPublicProducts(db, { q: s.product.name })).total, 1);
  assert.equal((await listPublicProducts(db, { q: s.product.name, stock: "1" })).total, 0);
  assert.equal((await quoteCart(db, s.input.lines)).valid, false);
  await assert.rejects(submitCheckout(db, s.user.id, s.input, s.provider, config), { code: "INSUFFICIENT_STOCK" });
  assert.equal(s.requests(), 0);
  assert.equal(await db.order.count({ where: { userId: s.user.id } }), 0);
  assert.equal(await db.stockReservation.count({ where: { variantId: s.variant.id } }), 0);
  assert.equal((await db.stock.findUnique({ where: { variantId: s.variant.id } }))?.reserved ?? 0, scenario === "fully reserved" ? 3 : 0);
});

test("no visible categories fails closed through SQL, Prisma and runtime paths", async () => {
  const s = await sample();
  await fixture.client.category.updateMany({ data: { isActive: false } });
  await check(s, false, "PRODUCT_UNAVAILABLE");
});
