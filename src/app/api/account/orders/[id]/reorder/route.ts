import { authenticatedApi } from "@/modules/identity/api";
import { catalogOperation } from "@/modules/catalog/http";
import { getDatabase } from "@/infrastructure/database/server";
import { reorder } from "@/modules/customer/account";
export function POST(request:Request,{params}:{params:Promise<{id:string}>}){return authenticatedApi(request,i=>catalogOperation(async()=>reorder(getDatabase(),i.user.id,(await params).id)));}
