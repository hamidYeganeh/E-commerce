import {NextResponse,type NextRequest} from "next/server";
import {getDatabase} from "@/infrastructure/database/server";
export async function proxy(request:NextRequest){
 const rule=await getDatabase().redirectRule.findUnique({where:{source:request.nextUrl.pathname}});
 if(rule){const target=new URL(rule.destination,request.url);target.search=request.nextUrl.search;return NextResponse.redirect(target,rule.permanent?308:307);}
 return NextResponse.next();
}
export const config={matcher:["/((?!api|admin|account|staff|_next|favicon.ico|images|fonts).*)"]};
