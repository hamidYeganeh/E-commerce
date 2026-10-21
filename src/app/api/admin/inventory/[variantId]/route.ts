import { authenticatedApi } from "@/modules/identity/api";
import { getDatabase } from "@/infrastructure/database/server";
import { adjustStock } from "@/modules/inventory/service";
import { catalogOperation } from "@/modules/catalog/http";
import { readJson } from "@/shared/http-input";
export async function PUT(request: Request, context: RouteContext<"/api/admin/inventory/[variantId]">) {
  return authenticatedApi(request, async (identity) => catalogOperation(async () => adjustStock(getDatabase(), identity.user.id, (await context.params).variantId, await readJson(request))), { staff: true, permission: "inventory.write" });
}
