import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedFoundation } from "../../prisma/seed-data";
import { createTestDatabase } from "../helpers/database";
import { saveProduct, saveTaxonomy, deleteTaxonomy } from "../../src/modules/catalog/management";
import { getPublicProduct, listPublicProducts, productInclude, productToInput } from "../../src/modules/catalog/repository";
import { adjustStock } from "../../src/modules/inventory/service";
import { inspectImage, uploadImage, verifyMedia, readImage } from "../../src/infrastructure/media/store";
import { catalogOperation } from "../../src/modules/catalog/http";
import { readJson } from "../../src/shared/http-input";
import type { ProductInput } from "../../src/modules/catalog/contracts";

let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
let ids: Awaited<ReturnType<typeof seedFoundation>>;
let owner: string, content: string, warehouse: string, customer: string, directory: string, mediaKey: string;
const priorDirectory = process.env.MEDIA_DIRECTORY, priorDriver = process.env.MEDIA_DRIVER;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWO4cXjijcMTGSAUAD36CLE4mVu7AAAAAElFTkSuQmCC", "base64");
before(async () => {
  fixture = await createTestDatabase(); ids = await seedFoundation(fixture.client);
  async function staff(roleKey: string) {
    const role = await fixture.client.role.findUniqueOrThrow({ where: { key: roleKey } });
    return (await fixture.client.user.create({ data: { name: roleKey, roles: { create: { roleId: role.id } } } })).id;
  }
  owner = await staff("owner"); content = await staff("content"); warehouse = await staff("warehouse");
  customer = (await fixture.client.user.create({ data: { name: "Customer" } })).id;
  directory = await mkdtemp(join(tmpdir(), "commerce-media-test-"));
  process.env.MEDIA_DIRECTORY = directory; process.env.MEDIA_DRIVER = "local";
  mediaKey = (await uploadImage(png)).objectKey;
});
after(async () => {
  await fixture?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  if (priorDirectory === undefined) delete process.env.MEDIA_DIRECTORY; else process.env.MEDIA_DIRECTORY = priorDirectory;
  if (priorDriver === undefined) delete process.env.MEDIA_DRIVER; else process.env.MEDIA_DRIVER = priorDriver;
});
async function draft(id = ids.productId) { return productToInput(await fixture.client.product.findUniqueOrThrow({ where: { id }, include: productInclude })); }
function publish(p: ProductInput): ProductInput { return { ...p, status: "ACTIVE", description: "توضیحات تأییدشدهٔ محصول آزمایشی", media: [{ objectKey: mediaKey, alt: "تصویر محصول آزمایشی" }], variants: p.variants.map((v) => ({ ...v, isActive: true })) }; }

test("product images are stored as random keys, validated and not resolved as arbitrary paths", async () => {
  assert.deepEqual(inspectImage(png), { ext: "png", mime: "image/png" });
  assert.equal((await readImage(mediaKey)).mime, "image/webp");
  assert.ok((await readImage(mediaKey)).bytes.length > 0);
  assert.throws(() => inspectImage(Buffer.from('<svg onload="alert(1)">')));
  assert.throws(() => inspectImage(Buffer.alloc(6 * 1024 * 1024)));
  await assert.rejects(uploadImage(png.subarray(0, 33)), { code: "INVALID_IMAGE" });
  await assert.rejects(readImage("../../.env"));
  await assert.rejects(verifyMedia([`${randomUUID()}.png`]), { code: "MISSING_MEDIA" });
});
test("only published products and their public projection are exposed", async () => {
  const db = fixture.client;
  assert.equal(await getPublicProduct(db, "dr-biz-honey-900g"), null);
  assert.equal((await listPublicProducts(db, {})).total, 0);
  const before = await draft();
  await saveProduct(db, content, ids.productId, publish(before), verifyMedia);
  const publicItem = await getPublicProduct(db, before.slug);
  assert.ok(publicItem);
  assert.equal(publicItem.variants[0].priceRial, "23500000");
  assert.equal(publicItem.variants[0].available, false);
  const json = JSON.stringify(publicItem);
  for (const secret of ["sourceUrl", "barcode", "sku", "reserved", "onHand", "version", "shippingWeightGrams"]) assert.equal(json.includes(`"${secret}"`), false, secret);
  assert.equal((await listPublicProducts(db, { category: "food", q: "عسل", tag: "breakfast", brand: "dr-biz" })).total, 1);
});
test("missing publication fields reject the whole transaction, with no partial audit", async () => {
  const db = fixture.client, input = await draft();
  const count = await db.auditLog.count();
  await assert.rejects(saveProduct(db, owner, ids.productId, { ...input, media: [] }, verifyMedia), { code: "PUBLICATION_INCOMPLETE" });
  await assert.rejects(saveProduct(db, owner, ids.productId, { ...input, variants: input.variants.map((v) => ({ ...v, priceRial: "0" })) }, verifyMedia), { code: "INVALID_PRICE" });
  await assert.rejects(saveProduct(db, owner, ids.productId, { ...input, primaryCategoryId: null }, verifyMedia), { code: "PUBLICATION_INCOMPLETE" });
  assert.equal(await db.auditLog.count(), count);
  assert.equal((await draft()).version, input.version);
});
test("catalog and inventory writers require independent permissions", async () => {
  const db = fixture.client, input = await draft();
  await assert.rejects(saveProduct(db, warehouse, ids.productId, input, verifyMedia), { code: "FORBIDDEN" });
  await assert.rejects(saveTaxonomy(db, customer, "brands", null, { name: "Blocked", slug: "blocked" }), { code: "FORBIDDEN" });
  await assert.rejects(adjustStock(db, content, ids.variantId, { version: 0, onHand: 5, reason: "test receipt", eventKey: randomUUID() }), { code: "FORBIDDEN" });
  await db.user.update({ where: { id: warehouse }, data: { disabledAt: new Date() } });
  await assert.rejects(adjustStock(db, warehouse, ids.variantId, { version: 0, onHand: 5, reason: "test receipt", eventKey: randomUUID() }), { code: "FORBIDDEN" });
  await db.user.update({ where: { id: warehouse }, data: { disabledAt: null } });
});
test("stock corrections preserve reservations, record signed history, and replay only the same payload", async () => {
  const db = fixture.client;
  const input = { version: 0, onHand: 10, reason: "دریافت موجودی اولیه", eventKey: randomUUID() };
  await adjustStock(db, warehouse, ids.variantId, input);
  await adjustStock(db, warehouse, ids.variantId, input);
  assert.equal(await db.stockMovement.count({ where: { eventKey: `manual:${input.eventKey}` } }), 1);
  assert.equal((await getPublicProduct(db, "dr-biz-honey-900g"))?.variants[0].available, true);
  await assert.rejects(adjustStock(db, warehouse, ids.variantId, { ...input, onHand: 12 }), { code: "IDEMPOTENCY_CONFLICT" });
  await assert.rejects(adjustStock(db, owner, ids.variantId, { ...input, eventKey: randomUUID(), onHand: 12 }), { code: "VERSION_CONFLICT" });
  await db.stock.update({ where: { variantId: ids.variantId }, data: { reserved: 4, version: { increment: 1 } } });
  await assert.rejects(adjustStock(db, owner, ids.variantId, { version: 2, onHand: 3, reason: "اصلاح موجودی", eventKey: randomUUID() }), { code: "RESERVED_STOCK" });
  const reduced = await adjustStock(db, owner, ids.variantId, { version: 2, onHand: 8, reason: "اصلاح موجودی", eventKey: randomUUID() });
  assert.equal(reduced.reserved, 4);
  assert.equal((await db.stockMovement.findFirstOrThrow({ where: { variantId: ids.variantId, quantity: -2 } })).type, "ADJUSTMENT");
});
test("stale product edits cannot overwrite another editor or inventory", async () => {
  const db = fixture.client, input = await draft();
  await saveProduct(db, content, ids.productId, { ...input, seoTitle: "عنوان جدید" }, verifyMedia);
  await assert.rejects(saveProduct(db, owner, ids.productId, { ...input, name: "stale" }, verifyMedia), { code: "VERSION_CONFLICT" });
  assert.equal((await draft()).seoTitle, "عنوان جدید");
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).onHand, 8);
  await assert.rejects(saveProduct(db, owner, ids.productId, { ...await draft(), variants: [{ ...input.variants[0], id: "foreign-variant" }] }, verifyMedia), { code: "INVALID_VARIANT" });
});
test("inherited required attributes and select options are enforced on publication", async () => {
  const db = fixture.client;
  const attr = await saveTaxonomy(db, owner, "attributes", null, { name: "بسته‌بندی", key: "packaging", type: "SELECT", options: [{ value: "glass", label: "شیشه‌ای" }, { value: "box", label: "جعبه‌ای" }] });
  const definition = await db.attribute.findUniqueOrThrow({ where: { id: attr.id }, include: { options: true } });
  const root = await saveTaxonomy(db, owner, "categories", null, { name: "دمنوش", slug: "herbal", attributes: [{ attributeId: attr.id, isRequired: true, isVariant: true, isFilterable: true }] });
  const child = await saveTaxonomy(db, owner, "categories", null, { name: "دمنوش برگ", slug: "herbal-leaf", parentId: root.id });
  const input: ProductInput = { ...publish(await draft()), slug: "herbal-product", name: "دمنوش آزمایشی", categoryIds: [child.id], primaryCategoryId: child.id, attributes: [], version: 0, variants: [{ name: "بسته شیشه‌ای", sku: "TEA-TEST", barcode: "", priceRial: "200000", netWeightGrams: null, shippingWeightGrams: null, isActive: true, attributes: [] }] };
  await assert.rejects(saveProduct(db, owner, null, input, verifyMedia), { code: "REQUIRED_ATTRIBUTE" });
  input.variants[0].attributes = [{ attributeId: attr.id, value: "other-option" }];
  await assert.rejects(saveProduct(db, owner, null, input, verifyMedia), { code: "INVALID_ATTRIBUTE" });
  input.variants[0].attributes[0].value = definition.options[0].id;
  const product = await saveProduct(db, owner, null, input, verifyMedia);
  assert.ok(product.id);
  assert.equal((await listPublicProducts(db, { category: "herbal", attribute: "packaging", option: definition.options[0].id })).total, 1);
  await assert.rejects(saveTaxonomy(db, owner, "categories", root.id, { name: "دمنوش", slug: "herbal", attributes: [] }), { code: "PUBLISHED_PRODUCT_CONFLICT" });
  assert.equal(await db.categoryAttribute.count({ where: { categoryId: root.id } }), 1);
  await assert.rejects(saveTaxonomy(db, owner, "categories", child.id, { name: "دمنوش برگ", slug: "herbal-leaf", parentId: root.id, attributes: [{ attributeId: attr.id, isRequired: true, isVariant: false, isFilterable: true }] }), { code: "ATTRIBUTE_SCOPE_CONFLICT" });
});
test("taxonomy edits preserve references and reject deleting in-use categories, tags, brands or attributes", async () => {
  const db = fixture.client, input = await draft();
  await assert.rejects(deleteTaxonomy(db, owner, "categories", input.primaryCategoryId!), { code: "IN_USE" });
  await assert.rejects(deleteTaxonomy(db, owner, "tags", input.tagIds[0]), { code: "IN_USE" });
  await assert.rejects(deleteTaxonomy(db, owner, "brands", input.brandId!), { code: "IN_USE" });
  const attr = await db.attribute.findUniqueOrThrow({ where: { key: "net-weight" } });
  await assert.rejects(saveTaxonomy(db, owner, "attributes", attr.id, { name: attr.name, key: attr.key, type: "TEXT" }), { code: "IMMUTABLE_ATTRIBUTE" });
  await assert.rejects(deleteTaxonomy(db, owner, "attributes", attr.id), { code: "IN_USE" });
  const unused = await saveTaxonomy(db, owner, "brands", null, { name: "برند جدید", slug: "new-brand" });
  await saveTaxonomy(db, content, "brands", unused.id, { name: "برند ویرایش‌شده", slug: "edited-brand" });
  await deleteTaxonomy(db, owner, "brands", unused.id);
  assert.equal(await db.brand.count({ where: { id: unused.id } }), 0);
});
test("all price/stock/attribute predicates match the same variant and prices sort precisely", async () => {
  const db = fixture.client, input = await draft();
  const weight = await db.attribute.findUniqueOrThrow({ where: { key: "net-weight" } });
  input.variants[0].priceRial = "10000";
  input.variants.push({ ...input.variants[0], id: undefined, sku: "HONEY-SECOND", netWeightGrams: 1800, name: "۱۸۰۰ گرم", barcode: "", priceRial: "20000", attributes: [{ attributeId: weight.id, value: "1800" }] });
  await saveProduct(db, owner, ids.productId, input, verifyMedia);
  const saved = await draft();
  const second = saved.variants.find((v) => v.sku === "HONEY-SECOND")!;
  await adjustStock(db, owner, second.id!, { onHand: 5, version: 0, reason: "ورود به انبار", eventKey: randomUUID() });
  // First variant is fully reserved; it must not satisfy a stock filter via the second variant.
  const first = await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } });
  await db.stock.update({ where: { variantId: ids.variantId }, data: { reserved: first.onHand, version: { increment: 1 } } });
  assert.equal((await listPublicProducts(db, { category: "honey", min: "1000", max: "1500", stock: "1" })).total, 0);
  assert.equal((await listPublicProducts(db, { category: "honey", stock: "1", attribute: "net-weight", option: "900" })).total, 0);
  const listing = await listPublicProducts(db, { category: "honey", stock: "1", attribute: "net-weight", option: "1800" });
  assert.equal(listing.items[0].listingPriceRial, "20000");
  const sorted = await listPublicProducts(db, { sort: "price-asc" });
  assert.equal(sorted.items[0].slug, "dr-biz-honey-900g");
  assert.equal((await listPublicProducts(db, { q: "%' OR 1=1 --" })).total, 0);
  assert.equal((await listPublicProducts(db, { category: "does-not-exist" })).total, 0);
});
test("duplicate SKU and variant removal roll back without damaging saved products", async () => {
  const db = fixture.client, input = await draft();
  const count = await db.auditLog.count();
  const duplicated = structuredClone(input);
  duplicated.variants[1].netWeightGrams = 900;
  duplicated.variants[1].attributes[0].value = "۰۹۰۰٫۰";
  await assert.rejects(saveProduct(db, owner, ids.productId, duplicated, verifyMedia), { code: "DUPLICATE_VARIANT" });
  await assert.rejects(saveProduct(db, owner, ids.productId, { ...input, variants: input.variants.slice(0, 1) }, verifyMedia), { code: "INVALID_VARIANT" });
  const other = { ...input, version: 0, name: "duplicate", slug: "duplicate-product", variants: input.variants.map((v) => ({ ...v, id: undefined })) };
  await assert.rejects(saveProduct(db, owner, null, other, verifyMedia), { code: "P2002" });
  assert.equal(await db.product.count({ where: { slug: other.slug } }), 0);
  assert.equal(await db.auditLog.count(), count);
});
test("archiving and disabled ancestor categories immediately remove products from every public read", async () => {
  const db = fixture.client, input = await draft();
  await saveProduct(db, owner, ids.productId, { ...input, status: "ARCHIVED" }, verifyMedia);
  assert.equal(await getPublicProduct(db, input.slug), null);
  assert.equal((await listPublicProducts(db, { category: "honey" })).total, 0);
  await saveProduct(db, owner, ids.productId, { ...await draft(), status: "ACTIVE" }, verifyMedia);
  const food = await db.category.findUniqueOrThrow({ where: { slug: "food" } });
  await assert.rejects(saveTaxonomy(db, owner, "categories", food.id, { name: food.name, slug: food.slug, isActive: false }), { code: "PUBLISHED_PRODUCT_CONFLICT" });
  // Read side is defensive even for direct database changes outside the service.
  await db.category.update({ where: { id: food.id }, data: { isActive: false } });
  assert.equal(await getPublicProduct(db, input.slug), null);
  assert.equal((await listPublicProducts(db, { category: "honey" })).total, 0);
  await db.category.update({ where: { id: food.id }, data: { isActive: true } });
});
test("HTTP errors are bounded, actionable, and never expose SQL or internal errors", async () => {
  const bad = await catalogOperation(() => saveProduct(fixture.client, owner, null, { name: "bad" }, verifyMedia));
  assert.equal(bad.status, 400);
  assert.equal(bad.headers.get("cache-control"), "no-store");
  const tooLarge = await catalogOperation(() => readJson(new Request("https://shop.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: "a".repeat(300000) }) })));
  assert.equal(tooLarge.status, 413);
  const unexpected = await catalogOperation(async () => { throw new Error("DATABASE_PASSWORD=do-not-leak"); });
  assert.equal(unexpected.status, 503);
  assert.equal((await unexpected.text()).includes("do-not-leak"), false);
});
