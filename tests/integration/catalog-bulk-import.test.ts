import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { createTestDatabase } from "../helpers/database";
import { seedFoundation } from "../../prisma/seed-data";
import { getPublicProduct } from "../../src/modules/catalog/repository";
import { customers } from "../../src/modules/operations/customers";
import { bulkProducts, exportWorkbook, previewPrices, applyPrices } from "../../src/modules/operations/spreadsheets";

let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
let ids: Awaited<ReturnType<typeof seedFoundation>>;
let owner: string;
const previousSecret = process.env.BETTER_AUTH_SECRET;
const previousUrl = process.env.BETTER_AUTH_URL;

before(async () => {
  process.env.BETTER_AUTH_SECRET = "test-only-catalog-import-secret-at-least-32";
  process.env.BETTER_AUTH_URL = "https://shop.test";
  fixture = await createTestDatabase();
  ids = await seedFoundation(fixture.client);
  const role = await fixture.client.role.findUniqueOrThrow({ where: { key: "owner" } });
  owner = (await fixture.client.user.create({ data: { name: "کارمند آزمایشی", roles: { create: { roleId: role.id } } } })).id;
});

after(async () => {
  await fixture?.close();
  if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = previousSecret;
  if (previousUrl === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = previousUrl;
});

test("bulk publication persists an existing category as primary and makes the product visible", async () => {
  const db = fixture.client;
  await db.product.update({ where: { id: ids.productId }, data: { description: "توضیحات محصول آزمایشی", media: { create: { objectKey: `${randomUUID()}.webp`, alt: "عسل آزمایشی" } } } });
  await db.productVariant.update({ where: { id: ids.variantId }, data: { isActive: true } });
  await db.productCategory.updateMany({ where: { productId: ids.productId }, data: { isPrimary: false } });
  const category = await db.productCategory.findFirstOrThrow({ where: { productId: ids.productId } });
  const product = await db.product.findUniqueOrThrow({ where: { id: ids.productId } });
  await bulkProducts(db, owner, { products: [{ id: product.id, version: product.version }], status: "ACTIVE", categoryId: category.categoryId });
  assert.equal((await db.productCategory.findUniqueOrThrow({ where: { productId_categoryId: { productId: product.id, categoryId: category.categoryId } } })).isPrimary, true);
  const visible = await getPublicProduct(db, product.slug);
  assert.ok(visible);
  assert.equal(visible.categories.filter(c => c.isPrimary).length, 1);
});

test("bulk category additions preserve a previously chosen primary category", async () => {
  const db = fixture.client;
  const original = await db.productCategory.findFirstOrThrow({ where: { productId: ids.productId, isPrimary: true } });
  const category = await db.category.create({ data: { name: "دستهٔ دوم", slug: "second-group" } });
  const product = await db.product.findUniqueOrThrow({ where: { id: ids.productId } });
  await bulkProducts(db, owner, { products: [{ id: product.id, version: product.version }], categoryId: category.id });
  const primary = await db.productCategory.findMany({ where: { productId: product.id, isPrimary: true } });
  assert.deepEqual(primary.map(c => c.categoryId), [original.categoryId]);
});

async function priceWorkbook(value: string | number) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await exportWorkbook(fixture.client, owner, "prices") as unknown as ExcelJS.Buffer);
  book.worksheets[0].getCell(2, 4).value = value;
  return Buffer.from(await book.xlsx.writeBuffer());
}

test("Excel price changes accept exact sixteen-digit text within the catalog price limits", async () => {
  const db = fixture.client;
  await db.productVariant.update({ where: { id: ids.variantId }, data: { priceRial: 9000000000000000n } });
  const preview = await previewPrices(db, owner, await priceWorkbook("8999999999999999"));
  assert.equal(preview.rows[0].oldPrice, "9000000000000000");
  assert.equal(preview.rows[0].newPrice, "8999999999999999");
  await applyPrices(db, owner, preview.token);
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: ids.variantId } })).priceRial, 8999999999999999n);
});

test("Excel price preview rejects unsafe numeric cells and prices outside the shared catalog limit", async () => {
  const db = fixture.client;
  const previous = await db.productVariant.findUniqueOrThrow({ where: { id: ids.variantId } });
  await assert.rejects(previewPrices(db, owner, await priceWorkbook(Number.MAX_SAFE_INTEGER + 1)), { code: "INVALID_FILE" });
  await assert.rejects(previewPrices(db, owner, await priceWorkbook("9000000000000001")));
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: ids.variantId } })).priceRial, previous.priceRial);
});

test("customer name and normalized phone filters select the same accounts in list and Excel export", async () => {
  const db = fixture.client;
  const customer = await db.user.create({ data: { name: "مشتری جست‌وجوی اکسل", phoneNumber: "+989123456789" } });
  await db.user.create({ data: { name: customer.name, phoneNumber: "+989123456788", roles: { create: { roleId: (await db.role.findUniqueOrThrow({ where: { key: "content" } })).id } } } });
  for (const query of [customer.name, "09123456789", "۰۹۱۲۳۴۵۶۷۸۹", "+98 912 345 6789"]) {
    const listed = await customers(db, owner, query);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await exportWorkbook(db, owner, "customers", query) as unknown as ExcelJS.Buffer);
    const exported = book.worksheets[0].getColumn(1).values.slice(2);
    assert.deepEqual(listed.rows.map(user => user.id), [customer.id], query);
    assert.deepEqual(exported, [customer.id], query);
  }
});
