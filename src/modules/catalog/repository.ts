import { purchasePolicy, isActivePricedVariant } from "./purchase-policy";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { ProductInput } from "./contracts";
import { canonicalNumber, categoryAncestors } from "./rules";

export const productInclude = {
  categories: true, tags: true, attributes: true,
  media: { orderBy: { position: "asc" as const } },
  variants: { orderBy: { createdAt: "asc" as const }, include: { attributes: true, stock: true } },
} satisfies Prisma.ProductInclude;
export type CatalogProduct = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
export function productToInput(p: CatalogProduct): ProductInput {
  return {
    name: p.name, slug: p.slug, description: p.description ?? "", status: p.status, version: p.version,
    brandId: p.brandId, seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "",
    categoryIds: p.categories.map((c) => c.categoryId), primaryCategoryId: p.categories.find((c) => c.isPrimary)?.categoryId ?? null,
    tagIds: p.tags.map((t) => t.tagId), attributes: p.attributes.map((a) => ({ attributeId: a.attributeId, value: a.optionId ?? a.value ?? "" })),
    media: p.media.map((m) => ({ objectKey: m.objectKey, alt: m.alt })),
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, sku: v.sku, barcode: v.barcode ?? "", priceRial: v.priceRial.toString(), netWeightGrams: v.netWeightGrams, shippingWeightGrams: v.shippingWeightGrams, isActive: v.isActive, attributes: v.attributes.map((a) => ({ attributeId: a.attributeId, value: a.optionId ?? a.value ?? "" })) })),
  };
}
export async function getLookups(db: Prisma.TransactionClient) {
  const categories = await db.category.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { attributes: true } });
  const tags = await db.tag.findMany({ orderBy: { name: "asc" } });
  const brands = await db.brand.findMany({ orderBy: { name: "asc" } });
  const attributes = await db.attribute.findMany({ orderBy: { name: "asc" }, include: { options: { orderBy: { position: "asc" } } } });
  return { categories, tags, brands, attributes };
}
export async function listAdminProducts(db: PrismaClient, query = "", page = 1, canReadStock = false) {
  const where: Prisma.ProductWhereInput = query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { variants: { some: { sku: { contains: query, mode: "insensitive" } } } }] } : {};
  const [total, items] = await db.$transaction([
    db.product.count({ where }),
    db.product.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: { id: true, name: true, slug: true, status: true, updatedAt: true, variants: { select: { priceRial: true, isActive: true, stock: { select: { onHand: true, reserved: true } } } } } }),
  ]);
  return { total, page, items: items.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString(), variants: p.variants.map((v) => ({ priceRial: v.priceRial.toString(), isActive: v.isActive, ...(canReadStock ? { available: v.stock ? v.stock.onHand - v.stock.reserved : 0 } : {}) })) })) };
}

// Only this allowlisted projection can cross the public API boundary.
export function publicProduct(p: CatalogProduct, lookups: Awaited<ReturnType<typeof getLookups>>) {
  const display = (values: { attributeId: string; optionId: string | null; value: string | null }[]) => values.map((value) => {
    const attr = lookups.attributes.find((a) => a.id === value.attributeId)!;
    return { name: attr.name, key: attr.key, unit: attr.unit, value: value.optionId ? attr.options.find((o) => o.id === value.optionId)?.label ?? "" : attr.type === "BOOLEAN" ? (value.value === "true" ? "بله" : "خیر") : attr.type === "NUMBER" ? (value.value ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]).replace(".", "٫") : value.value ?? "" };
  });
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description ?? "", seoTitle: p.seoTitle, seoDescription: p.seoDescription,
    brand: lookups.brands.find((b) => b.id === p.brandId) ? { name: lookups.brands.find((b) => b.id === p.brandId)!.name, slug: lookups.brands.find((b) => b.id === p.brandId)!.slug } : null,
    categories: p.categories.flatMap((c) => { const category = lookups.categories.find((n) => n.id === c.categoryId); return category ? [{ name: category.name, slug: category.slug, isPrimary: c.isPrimary }] : []; }),
    tags: p.tags.flatMap((t) => { const tag = lookups.tags.find((n) => n.id === t.tagId); return tag ? [{ name: tag.name, slug: tag.slug }] : []; }),
    media: p.media.map((m) => ({ url: `/api/media/${m.objectKey}`, alt: m.alt })), attributes: display(p.attributes),
    variants: p.variants.filter(isActivePricedVariant).map((v) => ({ id: v.id, name: v.name, priceRial: v.priceRial.toString(), available: !!v.stock && v.stock.onHand > v.stock.reserved, netWeightGrams: v.netWeightGrams, attributes: display(v.attributes) })),
  };
}
export type PublicProduct = ReturnType<typeof publicProduct>;
export function visibleCategoryIds(categories: { id: string; parentId: string | null; isActive: boolean }[]) {
  return categories.filter((c) => categoryAncestors([c.id], categories).every((id) => categories.find((n) => n.id === id)?.isActive)).map((c) => c.id);
}
async function publicProductSnapshot(db: Prisma.TransactionClient, slug: string) {
  const lookups = await getLookups(db);
  const visible = visibleCategoryIds(lookups.categories);
  const policy = purchasePolicy(visible);
  const p = await db.product.findFirst({ where: { slug, ...policy.productWhere }, include: productInclude });
  return p ? publicProduct(p, lookups) : null;
}

export type PublicFilters = { q?: string; category?: string; tag?: string; brand?: string; min?: string; max?: string; stock?: string; sort?: string; page?: string; attribute?: string; option?: string };
async function publicListingSnapshot(db: Prisma.TransactionClient, filters: PublicFilters) {
  const lookups = await getLookups(db);
  const visible = visibleCategoryIds(lookups.categories);
  const category = filters.category ? lookups.categories.find((c) => c.slug === filters.category && visible.includes(c.id)) : null;
  const descendants = category ? lookups.categories.filter((c) => visible.includes(c.id) && categoryAncestors([c.id], lookups.categories).includes(category.id)).map((c) => c.id) : [];
  const page = Math.max(1, Math.min(100000, Number.parseInt(filters.page ?? "1", 10) || 1));
  const money = (value?: string) => value && /^\d{1,15}$/.test(value) ? BigInt(value) * 10n : null;
  const min = money(filters.min), max = money(filters.max);
  const attribute = filters.attribute ? lookups.attributes.find((a) => a.key === filters.attribute) : null;
  // Attribute filters must belong to a filterable category assignment.
  const filterable = attribute && lookups.categories.some((c) => visible.includes(c.id) && c.attributes.some((a) => a.attributeId === attribute.id && a.isFilterable));
  const option = attribute?.type === "NUMBER" && filters.option ? canonicalNumber(filters.option) : filters.option;
  const attrFilter = attribute && filterable && filters.option ? Prisma.sql`AND (
    EXISTS (SELECT 1 FROM "ProductAttributeValue" a WHERE a."productId"=p.id AND a."attributeId"=${attribute.id} AND (a.value=${option} OR a."optionId"=${option}))
    OR EXISTS (SELECT 1 FROM "VariantAttributeValue" a WHERE a."variantId"=v.id AND a."attributeId"=${attribute.id} AND (a.value=${option} OR a."optionId"=${option})))` : Prisma.empty;
  const policy = purchasePolicy(visible);
  const conditions = Prisma.sql`${policy.sql}
    ${filters.q ? Prisma.sql`AND (p.name ILIKE ${`%${filters.q.slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`} OR p.description ILIKE ${`%${filters.q.slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`})` : Prisma.empty}
    ${filters.category ? Prisma.sql`AND EXISTS (SELECT 1 FROM "ProductCategory" c WHERE c."productId"=p.id AND c."categoryId" IN (${Prisma.join(descendants.length ? descendants : ["__none__"])}))` : Prisma.empty}
    ${filters.tag ? Prisma.sql`AND EXISTS (SELECT 1 FROM "ProductTag" t JOIN "Tag" g ON g.id=t."tagId" WHERE t."productId"=p.id AND g.slug=${filters.tag})` : Prisma.empty}
    ${filters.brand ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Brand" b WHERE b.id=p."brandId" AND b.slug=${filters.brand})` : Prisma.empty}
    ${min !== null ? Prisma.sql`AND v."priceRial">=${min}` : Prisma.empty} ${max !== null ? Prisma.sql`AND v."priceRial"<=${max}` : Prisma.empty}
    ${filters.stock === "1" ? Prisma.sql`AND s."onHand">s.reserved` : Prisma.empty} ${attrFilter}`;
  const group = Prisma.sql`FROM "Product" p JOIN "ProductVariant" v ON v."productId"=p.id LEFT JOIN "Stock" s ON s."variantId"=v.id WHERE ${conditions} GROUP BY p.id`;
  const sort = filters.sort === "price-asc" ? Prisma.sql`price ASC, id ASC` : filters.sort === "price-desc" ? Prisma.sql`price DESC, id ASC` : Prisma.sql`"createdAt" DESC, id ASC`;
  const rows = await db.$queryRaw<{ id: string; price: bigint; total: bigint }[]>(Prisma.sql`SELECT id, price, count(*) OVER() AS total FROM (SELECT p.id, p."createdAt", min(v."priceRial") AS price ${group}) matches ORDER BY ${sort} LIMIT 12 OFFSET ${(page - 1) * 12}`);
  const items = await db.product.findMany({ where: { id: { in: rows.map((r) => r.id) } }, include: productInclude });
  // Separate count only for an empty/out-of-range page.
  const total = rows.length ? Number(rows[0].total) : Number((await db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM (SELECT p.id ${group}) matches`))[0].total);
  return {
    items: rows.flatMap((r) => { const product = items.find((p) => p.id === r.id); return product && policy.allowsProduct(product) ? [{ ...publicProduct(product, lookups), listingPriceRial: r.price.toString() }] : []; }), total, page,
    categories: lookups.categories.filter((c) => visible.includes(c.id)).map((c) => ({ id: c.id, name: c.name, slug: c.slug, parentId: c.parentId, description: c.description, seoTitle: c.seoTitle, seoDescription: c.seoDescription })),
    tags: lookups.tags.map((t) => ({ name: t.name, slug: t.slug, description: t.description, seoTitle: t.seoTitle, seoDescription: t.seoDescription, isIndexable: t.isIndexable })),
    brands: lookups.brands.map((b) => ({ name: b.name, slug: b.slug })),
    filterAttributes: lookups.attributes.filter((a) => lookups.categories.some((c) => visible.includes(c.id) && (!category || categoryAncestors([category.id], lookups.categories).includes(c.id) || descendants.includes(c.id)) && c.attributes.some((r) => r.attributeId === a.id && r.isFilterable))).map((a) => ({ id: a.id, name: a.name, key: a.key, type: a.type, options: a.options.map((o) => ({ id: o.id, label: o.label })) })),
  };
}

export async function getPublicProduct(db: PrismaClient, slug: string) {
  return db.$transaction((tx) => publicProductSnapshot(tx, slug), { isolationLevel: "RepeatableRead" });
}
export async function listPublicProducts(db: PrismaClient, filters: PublicFilters) {
  return db.$transaction((tx) => publicListingSnapshot(tx, filters), { isolationLevel: "RepeatableRead" });
}
