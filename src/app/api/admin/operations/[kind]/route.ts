import {authenticatedApi} from "@/modules/identity/api";
import {getDatabase} from "@/infrastructure/database/server";
import {catalogOperation} from "@/modules/catalog/http";
import {recordKind,saveRecord} from "@/modules/operations/records";
import {saveCoupon} from "@/modules/operations/commerce";
import {readJson} from "@/shared/http-input";
import {jsonSafe} from "@/shared/json";
export async function POST(request:Request,context:{params:Promise<{kind:string}>}){
 return authenticatedApi(request,identity=>catalogOperation(async()=>{
  const {kind}=await context.params;const body=await readJson(request);
  if(kind==="coupons") {const d=body as {id?:string;data:unknown};return jsonSafe(await saveCoupon(getDatabase(),identity.user.id,d.id,d.data));}
  return jsonSafe(await saveRecord(getDatabase(),identity.user.id,recordKind(kind),body));
 }),{staff:true});
}
