import { authenticatedApi } from "@/modules/identity/api";
import { catalogOperation } from "@/modules/catalog/http";
import { getDatabase } from "@/infrastructure/database/server";
import { readJson } from "@/shared/http-input";
import { manageAddress } from "@/modules/customer/account";
export function GET(request:Request){return authenticatedApi(request,i=>catalogOperation(async()=>getDatabase().address.findMany({where:{userId:i.user.id},orderBy:{updatedAt:"desc"}})));}
export function POST(request:Request){return authenticatedApi(request,i=>catalogOperation(async()=>{const body=await readJson(request) as Record<string,unknown>;return manageAddress(getDatabase(),i.user.id,{...body,address:body.address??body});}));}
