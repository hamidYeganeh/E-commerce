import { z } from "zod";
import { authenticatedApi } from "@/modules/identity/api";
import { getDatabase } from "@/infrastructure/database/server";
import { saveTaxonomy, deleteTaxonomy } from "@/modules/catalog/management";
import { catalogOperation } from "@/modules/catalog/http";
import { readJson } from "@/shared/http-input";
const kindSchema = z.enum(["categories", "tags", "brands", "attributes"]);
export async function PUT(request: Request, context: RouteContext<"/api/admin/catalog/taxonomy/[kind]/[id]">) {
  return authenticatedApi(request, async (identity) => catalogOperation(async () => { const { kind, id } = await context.params; return saveTaxonomy(getDatabase(), identity.user.id, kindSchema.parse(kind), id, await readJson(request)); }), { staff: true, permission: "catalog.write" });
}
export async function DELETE(request: Request, context: RouteContext<"/api/admin/catalog/taxonomy/[kind]/[id]">) {
  return authenticatedApi(request, async (identity) => catalogOperation(async () => { const { kind, id } = await context.params; await deleteTaxonomy(getDatabase(), identity.user.id, kindSchema.parse(kind), id); return { deleted: true }; }), { staff: true, permission: "catalog.write" });
}
