import { authenticatedApi } from "@/modules/identity/api";
import { catalogOperation } from "@/modules/catalog/http";
import { getDatabase } from "@/infrastructure/database/server";
import { readJson } from "@/shared/http-input";
import { settleRefund } from "@/modules/returns/management";
export function POST(request:Request,{params}:{params:Promise<{id:string}>}) {return authenticatedApi(request,i=>catalogOperation(async()=>settleRefund(getDatabase(),i.user.id,(await params).id,await readJson(request))),{staff:true,permission:"payments.refund"});}
