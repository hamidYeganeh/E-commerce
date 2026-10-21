import{connection}from"next/server";
import{getDatabase}from"@/infrastructure/database/server";
import{connectRedis}from"@/infrastructure/redis/client";
export async function GET(){await connection();try{const db=getDatabase();await db.$queryRaw`SELECT 1`;await(await connectRedis()).ping();const pulse=await db.storeRecord.findUnique({where:{kind_slug:{kind:"system",slug:"worker-pulse"}}});const ok=!!pulse&&pulse.updatedAt.getTime()>Date.now()-120000;return Response.json({ok},{status:ok?200:503,headers:{"Cache-Control":"no-store"}});}catch{return Response.json({ok:false},{status:503,headers:{"Cache-Control":"no-store"}});}}
