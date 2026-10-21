import type { CommerceAuth } from "./auth";

const posts = new Set([
  "/phone-number/send-otp", "/phone-number/verify", "/sign-in/email", "/sign-out",
  "/two-factor/enable", "/two-factor/verify-totp", "/two-factor/verify-backup-code",
  "/two-factor/generate-backup-codes", "/two-factor/get-totp-uri",
]);
export function isSameOrigin(request: Request, origin: string) {
  return request.headers.get("origin") === origin;
}

export async function handleAuthRequest(auth: CommerceAuth, request: Request, origin: string) {
  const path = new URL(request.url).pathname.slice("/api/auth".length);
  if (!(request.method === "GET" && path === "/get-session") && !(request.method === "POST" && posts.has(path))) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  if (request.method === "POST") {
    if (!isSameOrigin(request, origin)) return Response.json({ code: "INVALID_ORIGIN" }, { status: 403 });
    if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ code: "JSON_REQUIRED" }, { status: 415 });
    const reader = request.body?.getReader();
    let length = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > 8192) { await reader.cancel(); return Response.json({ code: "BODY_TOO_LARGE" }, { status: 413 }); }
        chunks.push(next.value);
      }
    }
    const body = Buffer.concat(chunks);
    try { JSON.parse(body.toString()); } catch { return Response.json({ code: "INVALID_JSON" }, { status: 400 }); }
    request = new Request(request.url, { method: "POST", headers: request.headers, body });
  }
  const response = await auth.handler(request);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}
