import { connection } from "next/server";
import { getDatabase } from "@/infrastructure/database/server";
import { getPublicProduct } from "@/modules/catalog/repository";
import { catalogOperation } from "@/modules/catalog/http";
import { DomainError } from "@/shared/domain-error";
export async function GET(_request: Request, context: RouteContext<"/api/catalog/products/[slug]">) {
  await connection();
  return catalogOperation(async () => { const product = await getPublicProduct(getDatabase(), (await context.params).slug); if (!product) throw new DomainError("NOT_FOUND", "محصول پیدا نشد."); return product; });
}
