import {authenticatedApi} from "@/modules/identity/api";
import {getDatabase} from "@/infrastructure/database/server";
import {catalogOperation} from "@/modules/catalog/http";
import {deskAction} from "@/modules/operations/admin";
import {readJson} from "@/shared/http-input";
export function POST(request:Request){return authenticatedApi(request,i=>catalogOperation(async()=>deskAction(getDatabase(),i.user.id,await readJson(request))),{staff:true});}
