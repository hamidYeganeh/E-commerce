import { z } from "zod";
import { authenticatedApi } from "@/modules/identity/api";
import { getDatabase } from "@/infrastructure/database/server";
import { saveTaxonomy } from "@/modules/catalog/management";
import { catalogOperation } from "@/modules/catalog/http";
import { readJson } from "@/shared/http-input";
export async function POST(request: Request, context: RouteContext<"/api/admin/catalog/taxonomy/[kind]">) {
  return authenticatedApi(request, async (identity) => catalogOperation(async () => saveTaxonomy(getDatabase(), identity.user.id, z.enum(["categories", "tags", "brands", "attributes"]).parse((await context.params).kind), null, await readJson(request)), 201), { staff: true, permission: "catalog.write" });
}
