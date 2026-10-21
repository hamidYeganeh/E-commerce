import { authenticatedApi } from "@/modules/identity/api";
import { catalogOperation } from "@/modules/catalog/http";
import { getDatabase } from "@/infrastructure/database/server";
import { readJson } from "@/shared/http-input";
import { manageOrder } from "@/modules/orders/management";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticatedApi(request, identity => catalogOperation(async () => manageOrder(getDatabase(), identity.user.id, (await params).id, await readJson(request))), { staff: true, permission: "orders.read" });
}

export const POST=PATCH;
