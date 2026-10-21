import { connection } from "next/server";
import { getDatabase } from "@/infrastructure/database/server";
import { listPublicProducts } from "@/modules/catalog/repository";
import { catalogOperation } from "@/modules/catalog/http";
export async function GET(request: Request) {
  await connection();
  return catalogOperation(() => listPublicProducts(getDatabase(), Object.fromEntries(new URL(request.url).searchParams)));
}
