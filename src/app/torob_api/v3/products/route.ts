import {connection} from "next/server";
import {catalogOperation} from "@/modules/catalog/http";
import {getDatabase} from "@/infrastructure/database/server";
import {verifyTorobToken,torobProducts} from "@/modules/operations/torob";
import {authEnv} from "@/config/env";
import {readJson} from "@/shared/http-input";
import {DomainError} from "@/shared/domain-error";
import {operationLimit} from "@/modules/operations/rate-limit";
export async function POST(request:Request){await connection();const response=await catalogOperation(async()=>{const origin=authEnv().BETTER_AUTH_URL;verifyTorobToken(request.headers.get("X-Torob-Token")??"",request.headers.get("X-Torob-Token-Version"),new URL(origin).host);await operationLimit("torob","all",120,60);const db=getDatabase();if(!await db.storeRecord.count({where:{kind:"integration",status:"ACTIVE",AND:[{data:{path:["provider"],equals:"torob"}},{data:{path:["enabled"],equals:true}}]}}))throw new DomainError("NOT_FOUND","Integration disabled");return torobProducts(db,await readJson(request),origin);});if(response.ok)return response;const body=await response.json();return Response.json({error:body.message??"Invalid request"},{status:body.code==="FORBIDDEN"?401:response.status,headers:{"Cache-Control":"no-store"}});}
