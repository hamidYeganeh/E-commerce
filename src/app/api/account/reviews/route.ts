import{authenticatedApi}from"@/modules/identity/api";
import{catalogOperation}from"@/modules/catalog/http";
import{getDatabase}from"@/infrastructure/database/server";
import{readJson}from"@/shared/http-input";
import{submitProductReview}from"@/modules/customer/account";
export function POST(request:Request){return authenticatedApi(request,i=>catalogOperation(async()=>submitProductReview(getDatabase(),i.user.id,await readJson(request))));}
