import {operationLimit} from "@/modules/operations/rate-limit";
import { catalogOperation } from "@/modules/catalog/http";
import { getDatabase } from "@/infrastructure/database/server";
import { readJson } from "@/shared/http-input";
import { acceptStaffInvitation } from "@/modules/identity/staff-management";
import { authEnv } from "@/config/env";
export function POST(request:Request){if(request.headers.get("origin")!==new URL(authEnv().BETTER_AUTH_URL).origin)return Response.json({message:"مبدأ مجاز نیست."},{status:403});return catalogOperation(async()=>{await operationLimit("staff-accept","global",20,60);return acceptStaffInvitation(getDatabase(),await readJson(request));});}
