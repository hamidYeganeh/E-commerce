import { authenticatedApi } from "@/modules/identity/api";
import { getDatabase } from "@/infrastructure/database/server";
import { getLookups } from "@/modules/catalog/repository";
import { catalogOperation } from "@/modules/catalog/http";
export async function GET(request: Request) {
  return authenticatedApi(request, async () => catalogOperation(() => getLookups(getDatabase())), { staff: true, permission: "catalog.read" });
}
