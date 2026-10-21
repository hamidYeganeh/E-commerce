import {connection} from "next/server";
import {publicSettings} from "@/modules/operations/records";
import {getDatabase} from "@/infrastructure/database/server";
import {authEnv} from "@/config/env";
export async function GET(){await connection();let href="/favicon.ico";try{href=(await publicSettings(getDatabase()))?.faviconUrl||href;}catch{}if(href==="/api/store/favicon")href="/favicon.ico";return Response.redirect(new URL(href,authEnv().BETTER_AUTH_URL),307);}
