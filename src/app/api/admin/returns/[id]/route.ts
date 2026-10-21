import { authenticatedApi } from "@/modules/identity/api";
import { catalogOperation } from "@/modules/catalog/http";
import { getDatabase } from "@/infrastructure/database/server";
import { readJson } from "@/shared/http-input";
import { manageReturn, requestRefund } from "@/modules/returns/management";
export function POST(request:Request,{params}:{params:Promise<{id:string}>}) {return authenticatedApi(request,i=>catalogOperation(async()=>{const body=await readJson(request) as {action?:string};return body.action==="refund"?requestRefund(getDatabase(),i.user.id,(await params).id,body):manageReturn(getDatabase(),i.user.id,(await params).id,body);}),{staff:true});}
