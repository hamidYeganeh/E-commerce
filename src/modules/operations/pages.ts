import type {PrismaClient} from "../../generated/prisma/client";
import {recordSchemas} from "./contracts";
export async function editablePage(db:PrismaClient,slug:string){const r=await db.storeRecord.findUnique({where:{kind_slug:{kind:"page",slug}}});return r?.status==="ACTIVE"?{id:r.id,slug:r.slug,title:r.title,...recordSchemas.page.parse(r.data)}:null;}
