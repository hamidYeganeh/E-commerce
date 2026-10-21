import {authenticatedApi} from "@/modules/identity/api";
import {catalogOperation} from "@/modules/catalog/http";
import {getDatabase} from "@/infrastructure/database/server";
import {readJson} from "@/shared/http-input";
import {manageSupply} from "@/modules/inventory/supply";
import {manageStaff} from "@/modules/identity/staff-management";
import {requestReturn} from "@/modules/returns/management";
import {crawlSeo,saveRedirect} from "@/modules/operations/technical-seo";
import {saveRecord} from "@/modules/operations/records";
import {DomainError} from "@/shared/domain-error";
import {requirePermission} from "@/modules/identity/authorization";
import {z} from "zod";
export function POST(request:Request,{params}:{params:Promise<{kind:string}>}){return authenticatedApi(request,i=>catalogOperation(async()=>{
 const kind=(await params).kind,db=getDatabase(),body=await readJson(request) as Record<string,unknown>;
 if(kind==="supply")return manageSupply(db,i.user.id,body);
 if(kind==="staff")return manageStaff(db,i.user.id,body);
 if(kind==="returns")return requestReturn(db,i.user.id,z.string().parse(body.orderId),body,true);
 if(kind==="seo")return body.action==="crawl"?crawlSeo(db,i.user.id,body):saveRedirect(db,i.user.id,body);
 if(kind==="bundles")return saveRecord(db,i.user.id,"bundle",{...body,data:body,title:body.title,slug:body.slug,status:body.active?"ACTIVE":"DRAFT"});
 if(kind==="reviews"){const d=z.object({id:z.string(),status:z.enum(["ACTIVE","REJECTED"])}).parse(body);return db.$transaction(async tx=>{await requirePermission(tx,i.user.id,"catalog.write");const review=await tx.productReview.update({where:{id:d.id},data:{status:d.status}});await tx.auditLog.create({data:{actorId:i.user.id,entityType:"ProductReview",entityId:review.id,action:"review.moderated",changes:{status:d.status}}});return{saved:true};});}
 throw new DomainError("NOT_FOUND","بخش پیدا نشد.");
 }),{staff:true});}
