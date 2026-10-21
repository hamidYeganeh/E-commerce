import { DomainError } from "./domain-error";

export async function readBytes(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max) throw new DomainError("BODY_TOO_LARGE", "حجم فایل یا درخواست بیش از حد مجاز است.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.length;
    if (length > max) { await reader.cancel(); throw new DomainError("BODY_TOO_LARGE", "حجم فایل یا درخواست بیش از حد مجاز است."); }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks);
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new DomainError("JSON_REQUIRED", "فرمت درخواست باید JSON باشد.");
  const bytes = await readBytes(request, 256 * 1024);
  try { return JSON.parse(bytes.toString()); }
  catch { throw new DomainError("INVALID_JSON", "ساختار درخواست معتبر نیست."); }
}
