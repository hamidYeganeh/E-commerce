import {authenticatedApi} from "@/modules/identity/api";
import {catalogOperation} from "@/modules/catalog/http";
import {getDatabase} from "@/infrastructure/database/server";
import {exportWorkbook} from "@/modules/operations/spreadsheets";
import {DomainError} from "@/shared/domain-error";
export function GET(request:Request,{params}:{params:Promise<{kind:string}>}){return authenticatedApi(request,async i=>{let file:Buffer|undefined;const error=await catalogOperation(async()=>{const {kind}=await params;if(kind!=="prices"&&kind!=="customers")throw new DomainError("NOT_FOUND","خروجی پیدا نشد.");const url=new URL(request.url),q=(url.searchParams.get("q")??"").slice(0,100),page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get("page")??"1")||1));file=await exportWorkbook(getDatabase(),i.user.id,kind,q,page);return{ok:true};});if(!file)return error;return new Response(new Uint8Array(file),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="store-export.xlsx"`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});},{staff:true});}
