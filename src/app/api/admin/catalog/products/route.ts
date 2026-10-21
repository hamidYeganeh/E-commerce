import { authenticatedApi } from "@/modules/identity/api";
import { getDatabase } from "@/infrastructure/database/server";
import { listAdminProducts } from "@/modules/catalog/repository";
import { saveProduct } from "@/modules/catalog/management";
import { catalogOperation } from "@/modules/catalog/http";
import { readJson } from "@/shared/http-input";
import { verifyMedia } from "@/infrastructure/media/store";
export async function GET(request: Request) {
  return authenticatedApi(request, async (identity) => catalogOperation(() => { const p = new URL(request.url).searchParams; return listAdminProducts(getDatabase(), (p.get("q") ?? "").slice(0, 100), Math.max(1, Math.min(100000, Number.parseInt(p.get("page") ?? "1") || 1)), identity.permissions.includes("inventory.read")); }), { staff: true, permission: "catalog.read" });
}
export async function POST(request: Request) {
  return authenticatedApi(request, async (identity) => catalogOperation(async () => saveProduct(getDatabase(), identity.user.id, null, await readJson(request), verifyMedia), 201), { staff: true, permission: "catalog.write" });
}
