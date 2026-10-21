import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { requirePermission } from "../identity/authorization";
import { DomainError } from "../../shared/domain-error";
import { attributeSchema, brandSchema, categorySchema, productSchema, tagSchema } from "./contracts";
import { assertCategoryParent, normalizeTagName } from "./taxonomy";
import { getLookups, productInclude, productToInput } from "./repository";
import { effectiveRules, normalizeValues, validateProduct } from "./rules";

export type TaxonomyKind = "categories" | "tags" | "brands" | "attributes";
async function catalogLock(tx: Prisma.TransactionClient, actorId: string) {
  await requirePermission(tx, actorId, "catalog.write");
  // Serialize hierarchy, rule, publication and product edits as one consistency boundary.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(140017, 1)`;
}
async function audit(tx: Prisma.TransactionClient, actorId: string, action: string, entityType: string, entityId: string, changes?: Prisma.InputJsonObject) {
  await tx.auditLog.create({ data: { actorId, action, entityType, entityId, changes } });
}
async function validatePublished(tx: Prisma.TransactionClient) {
  const lookups = await getLookups(tx);
  const published = await tx.product.findMany({ where: { status: "ACTIVE" }, include: productInclude });
  for (const product of published) {
    try { validateProduct(productToInput(product), lookups.categories, lookups.attributes, lookups.categories.flatMap((c) => c.attributes)); }
    catch (error) { if (error instanceof DomainError) throw new DomainError("PUBLISHED_PRODUCT_CONFLICT", `این تغییر محصول «${product.name}» را نامعتبر می‌کند. ابتدا محصول را به پیش‌نویس برگردانید. ${error.message}`); throw error; }
  }
}
export async function saveTaxonomy(db: PrismaClient, actorId: string, kind: TaxonomyKind, id: string | null, input: unknown) {
  return db.$transaction(async (tx) => {
    await catalogLock(tx, actorId);
    if (kind === "categories") {
      const { attributes, ...data } = categorySchema.parse(input);
      if (new Set(attributes.map((a) => a.attributeId)).size !== attributes.length) throw new DomainError("DUPLICATE_ATTRIBUTE", "ویژگی تکراری است.");
      const nodes = await tx.category.findMany({ select: { id: true, parentId: true } });
      if (id && !nodes.some((n) => n.id === id)) throw new DomainError("NOT_FOUND", "دسته‌بندی پیدا نشد.");
      assertCategoryParent(nodes, id ?? "__new__", data.parentId);
      const category = id ? await tx.category.update({ where: { id }, data }) : await tx.category.create({ data });
      await tx.categoryAttribute.deleteMany({ where: { categoryId: category.id } });
      if (attributes.length) await tx.categoryAttribute.createMany({ data: attributes.map((a, position) => ({ ...a, categoryId: category.id, position })) });
      // Check inherited rule conflicts, even before products exist.
      const lookups = await getLookups(tx);
      for (const c of lookups.categories) effectiveRules([c.id], lookups.categories, lookups.categories.flatMap((n) => n.attributes));
      await validatePublished(tx);
      await audit(tx, actorId, id ? "category.updated" : "category.created", "Category", category.id);
      return { id: category.id };
    }
    if (kind === "tags") {
      const data = tagSchema.parse(input);
      const values = { ...data, normalizedName: normalizeTagName(data.name) };
      const tag = id ? await tx.tag.update({ where: { id }, data: values }) : await tx.tag.create({ data: values });
      await audit(tx, actorId, id ? "tag.updated" : "tag.created", "Tag", tag.id);
      return { id: tag.id };
    }
    if (kind === "brands") {
      const data = brandSchema.parse(input);
      const brand = id ? await tx.brand.update({ where: { id }, data }) : await tx.brand.create({ data });
      await audit(tx, actorId, id ? "brand.updated" : "brand.created", "Brand", brand.id);
      return { id: brand.id };
    }
    const data = attributeSchema.parse(input);
    const existing = id ? await tx.attribute.findUniqueOrThrow({ where: { id }, include: { options: true } }) : null;
    if (existing && (existing.type !== data.type || existing.key !== data.key || (existing.unit ?? "") !== data.unit)) throw new DomainError("IMMUTABLE_ATTRIBUTE", "نوع، واحد و کلید ویژگی بعد از ایجاد قابل تغییر نیست؛ ویژگی جدید بسازید.");
    if (existing?.options.some((o) => !data.options.some((v) => v.value === o.value))) throw new DomainError("IMMUTABLE_OPTION", "گزینه‌های قبلی را نگه دارید تا مشخصات محصولات تغییر نکند.");
    const attr = existing ? await tx.attribute.update({ where: { id: existing.id }, data: { name: data.name, unit: data.unit } }) : await tx.attribute.create({ data: { name: data.name, key: data.key, type: data.type, unit: data.unit } });
    for (const [position, option] of data.options.entries()) await tx.attributeOption.upsert({ where: { attributeId_value: { attributeId: attr.id, value: option.value } }, update: { label: option.label, position }, create: { attributeId: attr.id, ...option, position } });
    await audit(tx, actorId, id ? "attribute.updated" : "attribute.created", "Attribute", attr.id);
    return { id: attr.id };
  }, { timeout: 30000 });
}
export async function deleteTaxonomy(db: PrismaClient, actorId: string, kind: TaxonomyKind, id: string) {
  return db.$transaction(async (tx) => {
    await catalogLock(tx, actorId);
    if (kind === "categories") {
      if (await tx.productCategory.count({ where: { categoryId: id } }) || await tx.category.count({ where: { parentId: id } })) throw new DomainError("IN_USE", "دسته‌بندی دارای محصول یا زیردسته را نمی‌توان حذف کرد.");
      await tx.category.delete({ where: { id } });
    } else if (kind === "tags") {
      if (await tx.productTag.count({ where: { tagId: id } })) throw new DomainError("IN_USE", "تگ به محصول متصل است؛ ابتدا اتصال را بردارید.");
      await tx.tag.delete({ where: { id } });
    } else if (kind === "brands") {
      if (await tx.product.count({ where: { brandId: id } })) throw new DomainError("IN_USE", "برند به محصول متصل است.");
      await tx.brand.delete({ where: { id } });
    } else {
      if (await tx.categoryAttribute.count({ where: { attributeId: id } }) || await tx.productAttributeValue.count({ where: { attributeId: id } }) || await tx.variantAttributeValue.count({ where: { attributeId: id } })) throw new DomainError("IN_USE", "ویژگی در دسته‌بندی یا محصول استفاده شده است.");
      await tx.attribute.delete({ where: { id } });
    }
    await audit(tx, actorId, `${kind}.deleted`, kind, id);
  });
}
export async function saveProduct(db: PrismaClient, actorId: string, id: string | null, input: unknown, verifyMedia: (keys: string[]) => Promise<void>) {
  const data = productSchema.parse(input);
  await requirePermission(db, actorId, "catalog.write");
  await verifyMedia(data.media.map((m) => m.objectKey));
  return db.$transaction(async (tx) => {
    await catalogLock(tx, actorId);
    const previous = id ? await tx.product.findUnique({ where: { id }, include: productInclude }) : null;
    if (id && !previous) throw new DomainError("NOT_FOUND", "محصول پیدا نشد.");
    if (previous && previous.version !== data.version) throw new DomainError("VERSION_CONFLICT", "محصول توسط همکار دیگری تغییر کرده است. صفحه را دوباره باز کنید.");
    if (!previous && data.variants.some((v) => v.id)) throw new DomainError("INVALID_VARIANT", "شناسهٔ تنوع محصول نامعتبر است.");
    const oldIds = previous?.variants.map((v) => v.id) ?? [];
    if (oldIds.some((old) => !data.variants.some((v) => v.id === old)) || data.variants.some((v) => v.id && !oldIds.includes(v.id))) throw new DomainError("INVALID_VARIANT", "تنوع موجود را حذف نکنید؛ آن را غیرفعال کنید.");
    const lookups = await getLookups(tx);
    if (data.brandId && !lookups.brands.some((b) => b.id === data.brandId) || data.tagIds.some((tag) => !lookups.tags.some((t) => t.id === tag))) throw new DomainError("INVALID_REFERENCE", "برند یا تگ پیدا نشد.");
    data.attributes = normalizeValues(data.attributes, lookups.attributes);
    data.variants = data.variants.map((v) => ({ ...v, attributes: normalizeValues(v.attributes, lookups.attributes) }));
    validateProduct(data, lookups.categories, lookups.attributes, lookups.categories.flatMap((c) => c.attributes));
    const fields = { name: data.name, slug: data.slug, description: data.description, status: data.status, brandId: data.brandId, seoTitle: data.seoTitle, seoDescription: data.seoDescription };
    const product = previous ? await tx.product.update({ where: { id: previous.id, version: data.version }, data: { ...fields, version: { increment: 1 } } }) : await tx.product.create({ data: fields });
    await tx.productCategory.deleteMany({ where: { productId: product.id } });
    if (data.categoryIds.length) await tx.productCategory.createMany({ data: data.categoryIds.map((categoryId) => ({ productId: product.id, categoryId, isPrimary: categoryId === data.primaryCategoryId })) });
    await tx.productTag.deleteMany({ where: { productId: product.id } });
    if (data.tagIds.length) await tx.productTag.createMany({ data: data.tagIds.map((tagId) => ({ productId: product.id, tagId })) });
    await tx.productAttributeValue.deleteMany({ where: { productId: product.id } });
    const toValue = (entry: { attributeId: string; value: string }) => ({ attributeId: entry.attributeId, ...(lookups.attributes.find((a) => a.id === entry.attributeId)?.type === "SELECT" ? { optionId: entry.value } : { value: entry.value }) });
    if (data.attributes.length) await tx.productAttributeValue.createMany({ data: data.attributes.map((entry) => ({ productId: product.id, ...toValue(entry) })) });
    await tx.productMedia.deleteMany({ where: { productId: product.id } });
    if (data.media.length) await tx.productMedia.createMany({ data: data.media.map((m, position) => ({ ...m, position, productId: product.id })) });
    for (const { attributes, id: variantId, priceRial, barcode, ...variant } of data.variants) {
      const fields = { ...variant, barcode: barcode || null, priceRial: BigInt(priceRial) };
      const saved = variantId ? await tx.productVariant.update({ where: { id: variantId, productId: product.id }, data: { ...fields, version: { increment: 1 } } }) : await tx.productVariant.create({ data: { ...fields, productId: product.id, stock: { create: {} } } });
      await tx.variantAttributeValue.deleteMany({ where: { variantId: saved.id } });
      if (attributes.length) await tx.variantAttributeValue.createMany({ data: attributes.map((entry) => ({ variantId: saved.id, ...toValue(entry) })) });
    }
    await audit(tx, actorId, previous ? "product.updated" : "product.created", "Product", product.id, { fromStatus: previous?.status ?? null, toStatus: product.status, version: product.version });
    return { id: product.id, version: product.version };
  }, { timeout: 30000 });
}
