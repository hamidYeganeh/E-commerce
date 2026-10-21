import { authenticatedApi } from "@/modules/identity/api";
import { getDatabase } from "@/infrastructure/database/server";
import { productInclude, productToInput } from "@/modules/catalog/repository";
import { saveProduct } from "@/modules/catalog/management";
import { catalogOperation } from "@/modules/catalog/http";
import { readJson } from "@/shared/http-input";
import { DomainError } from "@/shared/domain-error";
import { verifyMedia } from "@/infrastructure/media/store";
export async function GET(request: Request, context: RouteContext<"/api/admin/catalog/products/[id]">) {
  return authenticatedApi(request, async (identity) => catalogOperation(async () => {
    const { id } = await context.params;
    const p = await getDatabase().product.findUnique({ where: { id }, include: productInclude });
    if (!p) throw new DomainError("NOT_FOUND", "محصول پیدا نشد.");
    return { id: p.id, ...productToInput(p), stocks: identity.permissions.includes("inventory.read") ? p.variants.map((v) => ({ variantId: v.id, ...v.stock })) : [] };
  }), { staff: true, permission: "catalog.read" });
}
export async function PUT(request: Request, context: RouteContext<"/api/admin/catalog/products/[id]">) {
  return authenticatedApi(request, async (identity) => catalogOperation(async () => saveProduct(getDatabase(), identity.user.id, (await context.params).id, await readJson(request), verifyMedia)), { staff: true, permission: "catalog.write" });
}
