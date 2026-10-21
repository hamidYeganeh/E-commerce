import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { DomainError } from "../../shared/domain-error";
import sharp from "sharp";

const keySchema = z.string().regex(/^[a-f0-9-]{36}\.(png|jpg|webp)$/);
const maxSize = 5 * 1024 * 1024;
export function inspectImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > maxSize) throw new DomainError("INVALID_IMAGE", "تصویر باید حداکثر ۵ مگابایت باشد.");
  if (bytes.length >= 32 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.subarray(12, 16).toString() === "IHDR") return { ext: "png", mime: "image/png" };
  if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes.length >= 20 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length) return { ext: "webp", mime: "image/webp" };
  throw new DomainError("INVALID_IMAGE", "فقط تصویر PNG، JPEG یا WebP معتبر پذیرفته می‌شود.");
}
function storage(): { client: S3Client; bucket: string } | { directory: string } {
  if (process.env.MEDIA_DRIVER === "s3") {
    const config = z.object({ MEDIA_S3_BUCKET: z.string().min(1), MEDIA_S3_REGION: z.string().min(1), MEDIA_S3_ENDPOINT: z.url().optional(), MEDIA_S3_ACCESS_KEY_ID: z.string().min(1), MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(1) }).parse(process.env);
    return { client: new S3Client({ region: config.MEDIA_S3_REGION, endpoint: config.MEDIA_S3_ENDPOINT, forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === "true", credentials: { accessKeyId: config.MEDIA_S3_ACCESS_KEY_ID, secretAccessKey: config.MEDIA_S3_SECRET_ACCESS_KEY } }), bucket: config.MEDIA_S3_BUCKET };
  }
  if (process.env.MEDIA_DRIVER && process.env.MEDIA_DRIVER !== "local") throw new Error("Invalid media driver");
  // Uploaded media is runtime data on a persistent volume, never a build input.
  return { directory: resolve(/* turbopackIgnore: true */ process.env.MEDIA_DIRECTORY ?? ".data/media") };
}
export async function uploadImage(bytes: Buffer) {
  inspectImage(bytes);
  // Decode before accepting; strip metadata and store a bounded, single-frame raster.
  try { bytes = await sharp(bytes, { failOn: "warning", limitInputPixels: 40000000, animated: false }).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(); }
  catch { throw new DomainError("INVALID_IMAGE", "تصویر بازخوانی نشد یا ابعاد آن بیش از حد مجاز است."); }
  const { mime } = inspectImage(bytes);
  const objectKey = `${randomUUID()}.webp`;
  const store = storage();
  if ("client" in store) await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: objectKey, Body: bytes, ContentType: mime }));
  else { await mkdir(store.directory, { recursive: true }); await writeFile(join(store.directory, objectKey), bytes, { flag: "wx" }); }
  return { objectKey, url: `/api/media/${objectKey}` };
}
export async function verifyMedia(keys: string[]) {
  const store = storage();
  for (const key of keys) {
    keySchema.parse(key);
    try {
      if ("client" in store) await store.client.send(new HeadObjectCommand({ Bucket: store.bucket, Key: key }));
      else await stat(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ store.directory, key));
    } catch { throw new DomainError("MISSING_MEDIA", "تصویر آپلودشده پیدا نشد؛ دوباره بارگذاری کنید."); }
  }
}
export async function readImage(key: string) {
  keySchema.parse(key);
  const store = storage();
  try {
    const bytes = "client" in store ? Buffer.from(await (await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: key }))).Body!.transformToByteArray()) : await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ store.directory, key));
    return { bytes, mime: inspectImage(bytes).mime };
  } catch { throw new DomainError("NOT_FOUND", "تصویر پیدا نشد."); }
}
