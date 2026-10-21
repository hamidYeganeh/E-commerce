import "server-only";
import { cache } from "react";
import { getDatabase } from "../../infrastructure/database/server";
import { getPublicProduct, listPublicProducts, type PublicFilters } from "./repository";
import { logger } from "../../infrastructure/logging/logger";

// React cache deduplicates page + metadata reads only within this render; prices are not persistently cached.
export const readPublicProduct = cache(async (slug: string) => {
  try { return { available: true as const, product: await getPublicProduct(getDatabase(), slug) }; }
  catch { logger.error({ component: "storefront" }, "Product read unavailable"); return { available: false as const, product: null }; }
});
export async function readPublicListing(filters: PublicFilters) {
  try { return await listPublicProducts(getDatabase(), filters); }
  catch { logger.error({ component: "storefront" }, "Catalog read unavailable"); return null; }
}
