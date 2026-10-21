import { connection } from "next/server";
import { z } from "zod";
import { getSessionCookie } from "better-auth/cookies";
import { getDatabase } from "@/infrastructure/database/server";
import { authenticatedApi } from "@/modules/identity/api";
import { getPublicProduct } from "@/modules/catalog/repository";
import { readImage } from "@/infrastructure/media/store";
import { logger } from "@/infrastructure/logging/logger";
export async function GET(request: Request, context: RouteContext<"/api/media/[key]">) {
  await connection();
  const { key } = await context.params;
  if (!z.string().regex(/^[a-f0-9-]{36}\.(png|jpg|webp)$/).safeParse(key).success) return new Response(null, { status: 404 });
  const serve = async () => {
    try { const { bytes, mime } = await readImage(key); return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline", "Cross-Origin-Resource-Policy": "same-origin" } }); }
    catch { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
  };
  // Staff can preview a newly uploaded image before attaching it to a product.
  if (getSessionCookie(request.headers)) {
    const privateResponse = await authenticatedApi(request, serve, { staff: true, permission: "catalog.read" });
    if (privateResponse.ok) return privateResponse;
  }
  try {
    const media = await getDatabase().productMedia.findMany({ where: { objectKey: key, product: { status: "ACTIVE" } }, select: { product: { select: { slug: true } } } });
    for (const item of media) if (await getPublicProduct(getDatabase(), item.product.slug)) return serve();
    const records=await getDatabase().storeRecord.findMany({where:{kind:{in:["article","banner","settings"]},status:"ACTIVE",OR:[{data:{path:["coverUrl"],equals:`/api/media/${key}`}},{data:{path:["imageUrl"],equals:`/api/media/${key}`}},{data:{path:["logoUrl"],equals:`/api/media/${key}`}},{data:{path:["faviconUrl"],equals:`/api/media/${key}`}}]},select:{id:true},take:1});
    if(records.length)return serve();
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  } catch {
    logger.error({ component: "media" }, "Media lookup unavailable");
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
