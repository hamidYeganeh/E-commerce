import {authenticatedApi} from "@/modules/identity/api";
import {catalogOperation} from "@/modules/catalog/http";
import {getDatabase} from "@/infrastructure/database/server";
import {previewPrices,applyPrices,bulkProducts} from "@/modules/operations/spreadsheets";
import {readBytes,readJson} from "@/shared/http-input";
import {z} from "zod";
import {DomainError} from "@/shared/domain-error";
export function POST(request:Request,{params}:{params:Promise<{action:string}>}){return authenticatedApi(request,i=>catalogOperation(async()=>{const {action}=await params,db=getDatabase();if(action==="preview")return previewPrices(db,i.user.id,await readBytes(request,2*1024*1024));if(action==="apply")return applyPrices(db,i.user.id,z.object({token:z.string().max(500000)}).parse(await readJson(request)).token);if(action==="products")return bulkProducts(db,i.user.id,await readJson(request));throw new DomainError("NOT_FOUND","عملیات پیدا نشد.");}),{staff:true,permission:"catalog.write"});}
