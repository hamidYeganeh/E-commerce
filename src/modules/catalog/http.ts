import { z } from "zod";
import { DomainError } from "../../shared/domain-error";
import { logger } from "../../infrastructure/logging/logger";

export async function catalogOperation(operation: () => Promise<unknown>, status = 200) {
  try { return Response.json(await operation(), { status, headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    let code = "SERVICE_UNAVAILABLE", message = "سرویس موقتاً در دسترس نیست.", status = 503;
    if (error instanceof z.ZodError) { code = "INVALID_INPUT"; message = "اطلاعات فرم را بررسی کنید."; status = 400; }
    else if (error instanceof DomainError) {
      code = error.code; message = error.message;
      status = code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "BODY_TOO_LARGE" ? 413 : ["VERSION_CONFLICT", "CART_VERSION_CONFLICT", "IN_USE", "IDEMPOTENCY_CONFLICT", "PUBLISHED_PRODUCT_CONFLICT"].includes(code) ? 409 : 400;
    } else if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2002") { code = "DUPLICATE"; message = "نامک، نام تگ، کد محصول یا بارکد تکراری است."; status = 409; }
      if (error.code === "P2025") { code = "NOT_FOUND"; message = "رکورد پیدا نشد."; status = 404; }
      if (error.code === "P2003") { code = "INVALID_REFERENCE"; message = "رکورد مرتبط پیدا نشد یا هنوز در حال استفاده است."; status = 409; }
    }
    if (status === 503) logger.error({ component: "catalog" }, "Catalog operation unavailable");
    return Response.json({ code, message, ...(error instanceof z.ZodError ? { fields: error.issues.map((i) => i.path.join(".")) } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
