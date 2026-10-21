import type { PrismaClient } from "../src/generated/prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/modules/identity/permissions";
import { normalizeTagName } from "../src/modules/catalog/taxonomy";
import {seedOperationsDefaults} from "./operations-defaults";

export async function seedFoundation(db: PrismaClient) {
  return db.$transaction(async (tx) => {
    await seedOperationsDefaults(tx);
    for (const key of PERMISSIONS) {
      await tx.permission.upsert({ where: { key }, update: {}, create: { key } });
    }
    for (const [key, keys] of Object.entries(ROLE_PERMISSIONS)) {
      const role = await tx.role.upsert({ where: { key }, update: {}, create: { key, name: key } });
      const permissions = await tx.permission.findMany({ where: { key: { in: [...keys] } } });
      await tx.rolePermission.createMany({ data: permissions.map(({ id }) => ({ roleId: role.id, permissionId: id })), skipDuplicates: true });
    }
    const brand = await tx.brand.upsert({ where: { slug: "dr-biz" }, update: {}, create: { name: "Dr.BIZ", slug: "dr-biz" } });
    const food = await tx.category.upsert({ where: { slug: "food" }, update: {}, create: { name: "مواد غذایی", slug: "food" } });
    const honey = await tx.category.upsert({ where: { slug: "honey" }, update: {}, create: { name: "عسل", slug: "honey", parentId: food.id } });
    const weight = await tx.attribute.upsert({ where: { key: "net-weight" }, update: {}, create: { key: "net-weight", name: "وزن خالص", type: "NUMBER", unit: "گرم" } });
    await tx.categoryAttribute.upsert({
      where: { categoryId_attributeId: { categoryId: honey.id, attributeId: weight.id } },
      update: {}, create: { categoryId: honey.id, attributeId: weight.id, isFilterable: true, isVariant: true },
    });
    const product = await tx.product.upsert({
      where: { slug: "dr-biz-honey-900g" }, update: {},
      create: {
        name: "عسل استاندارد ۹۰۰ گرمی Dr.BIZ", slug: "dr-biz-honey-900g", brandId: brand.id,
        status: "DRAFT", sourceUrl: "https://bizmlm.ir/products/3/2/1608",
        description: "پیش‌نویس کاتالوگ؛ مشخصات برچسب، مدارک، قیمت و شرایط تأمین پیش از انتشار باید تأیید شوند.",
      },
    });
    await tx.productCategory.upsert({
      where: { productId_categoryId: { productId: product.id, categoryId: honey.id } },
      update: {}, create: { productId: product.id, categoryId: honey.id, isPrimary: true },
    });
    for (const [name, slug] of [["صبحانه", "breakfast"], ["هدیه", "gift"]]) {
      const tag = await tx.tag.upsert({ where: { slug }, update: {}, create: { name, slug, normalizedName: normalizeTagName(name) } });
      await tx.productTag.upsert({ where: { productId_tagId: { productId: product.id, tagId: tag.id } }, update: {}, create: { productId: product.id, tagId: tag.id } });
    }
    const variant = await tx.productVariant.upsert({
      where: { sku: "DRBIZ-HONEY-900" }, update: {},
      create: {
        productId: product.id, name: "بسته ۹۰۰ گرمی", sku: "DRBIZ-HONEY-900", barcode: "6263097000177",
        // Observed on the source page on 2026-10-17, not an approved selling price.
        priceRial: 23500000n, netWeightGrams: 900, isActive: false,
      },
    });
    await tx.variantAttributeValue.upsert({
      where: { variantId_attributeId: { variantId: variant.id, attributeId: weight.id } },
      update: {}, create: { variantId: variant.id, attributeId: weight.id, value: "900" },
    });
    await tx.stock.upsert({ where: { variantId: variant.id }, update: {}, create: { variantId: variant.id } });
    return { productId: product.id, variantId: variant.id };
  }, { timeout: 30000 });
}
