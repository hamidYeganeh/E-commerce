import { Prisma } from "../../generated/prisma/client";

type PricedVariant = { isActive: boolean; priceRial: bigint };
type PurchaseProduct = {
  status: string;
  media: readonly unknown[];
  categories: readonly { categoryId: string; isPrimary: boolean }[];
};
type PurchaseVariant = PricedVariant & { product: PurchaseProduct };

// Stock and requested quantity are deliberately separate from catalog eligibility.
export function isActivePricedVariant(variant: PricedVariant) {
  return variant.isActive && variant.priceRial > 0n;
}

/** The visible ids already include ancestor visibility. SQL uses the repository's
 * fixed p (Product) and v (ProductVariant) aliases, so all variant filters bind to v.
 * This module does not fetch data, start transactions or decide stock availability.
 */
export function purchasePolicy(visibleCategoryIds: readonly string[]) {
  const visible = new Set(visibleCategoryIds);
  const ids = [...visible];
  function allowsProductBase(product: PurchaseProduct) {
    return product.status === "ACTIVE" && product.media.length > 0 &&
      product.categories.some(category => category.isPrimary && visible.has(category.categoryId)) &&
      product.categories.every(category => visible.has(category.categoryId));
  }
  function allowsVariant<T extends PurchaseVariant>(variant: T | null | undefined): variant is T {
    return !!variant && isActivePricedVariant(variant) && allowsProductBase(variant.product);
  }
  function allowsProduct(product: PurchaseProduct & { variants: readonly PricedVariant[] }) {
    return allowsProductBase(product) && product.variants.some(isActivePricedVariant);
  }
  const productWhere = {
    status: "ACTIVE",
    media: { some: {} },
    categories: { some: { isPrimary: true, categoryId: { in: ids } }, every: { categoryId: { in: ids } } },
    variants: { some: { isActive: true, priceRial: { gt: 0n } } },
  } satisfies Prisma.ProductWhereInput;
  const sql = ids.length ? Prisma.sql`p.status='ACTIVE' AND v."isActive"=true AND v."priceRial">0
    AND EXISTS (SELECT 1 FROM "ProductMedia" m WHERE m."productId"=p.id)
    AND EXISTS (SELECT 1 FROM "ProductCategory" c WHERE c."productId"=p.id AND c."isPrimary"=true AND c."categoryId" IN (${Prisma.join(ids)}))
    AND NOT EXISTS (SELECT 1 FROM "ProductCategory" c WHERE c."productId"=p.id AND c."categoryId" NOT IN (${Prisma.join(ids)}))` : Prisma.sql`FALSE`;
  return { allowsProduct, allowsVariant, productWhere, sql };
}
