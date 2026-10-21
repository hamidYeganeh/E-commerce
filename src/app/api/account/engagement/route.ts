import {operationLimit} from "@/modules/operations/rate-limit";
import {z} from "zod";
import {authenticatedApi} from "@/modules/identity/api";
import {catalogOperation} from "@/modules/catalog/http";
import {getDatabase} from "@/infrastructure/database/server";
import {readJson} from "@/shared/http-input";
import {requestRestock,submitCommunity} from "@/modules/operations/engagement";
export async function POST(request:Request){return authenticatedApi(request,identity=>catalogOperation(async()=>{await operationLimit("engagement",identity.user.id,10,600);const input=await readJson(request);if(input&&typeof input==="object"&&"action" in input&&input.action==="restock"){const d=z.object({variantId:z.string().min(1).max(100)}).parse(input);await requestRestock(getDatabase(),identity.user.id,d.variantId);return{accepted:true};}return submitCommunity(getDatabase(),identity.user.id,input);}));}
