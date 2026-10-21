import {bundleSchema} from "../checkout/bundle-contract";
import {notificationTopics} from "./notification-definitions";
import { z } from "zod";
import {phoneSchema} from "../identity/input";
import { slugSchema } from "../catalog/contracts";
const text = (max=4000) => z.string().trim().max(max).default("");
const money = z.string().regex(/^\d{1,15}$/).default("0");
export const publicUrl = z.string().trim().max(2000).refine(v => !v || (/^\/(?!\/)/.test(v) && !/[\\\u0000-\u0020]/.test(v)) || (() => { try { const u=new URL(v); return u.protocol === "https:" && !u.username && !u.password && !/[\\\u0000-\u0020]/.test(v); } catch { return false; } })(), "نشانی باید مسیر داخلی یا HTTPS باشد.").default("");
const refs = text(8000);
const seo = { seoTitle: text(160), seoDescription: text(320) };
export const recordSchemas = {
  bundle: bundleSchema,
  article: z.object({ body: text(60000), excerpt: text(500), coverUrl: publicUrl, productIds: refs, categoryIds: refs, ...seo }),
  page: z.object({ body: text(60000), ...seo }),
  faq: z.object({ targetType: z.enum(["product","category","tag"]), targetId: z.string().min(1).max(160), answer: text(6000), position: z.coerce.number().int().min(0).max(1000).default(0) }),
  question: z.object({ targetType: z.enum(["product","tag"]), targetId: z.string().min(1).max(160), question: text(2000), answer: text(6000), name: text(100) }),
  comment: z.object({ targetType: z.enum(["tag","article","order"]), targetId: z.string().min(1).max(160), body: text(3000), name: text(100), rating: z.coerce.number().int().min(1).max(5).default(5), answers:z.array(z.object({question:z.string().trim().min(1).max(200),rating:z.number().int().min(1).max(5)})).max(20).default([]) }),
  product: z.object({ videoUrl: publicUrl, audioUrl: publicUrl, relatedProductIds: refs, relatedArticleIds: refs }),
  shipping: z.object({ mode: z.enum(["FLAT","WEIGHT","PERCENT"]), baseRial: money, perKgRial: money, percentage: z.coerce.number().int().min(0).max(100).default(0), freeAboveRial: money, minimumRial: money, provinces: text(2000), cities: text(4000), maxWeightGrams: z.coerce.number().int().min(0).max(10000000).default(0), deliveryDays: z.coerce.number().int().min(0).max(90).default(3) }),
  banner: z.object({ imageUrl: publicUrl, href: publicUrl, placement: z.enum(["home","listing","product"]), categoryId: text(160), position: z.coerce.number().int().min(0).max(1000).default(0) }),
  settings: z.object({ brandName: text(100), logoUrl: publicUrl, faviconUrl: publicUrl, phone: text(32), email: z.union([z.literal(""),z.email()]).default(""), address: text(1000), orderPhone: z.union([z.literal(""),phoneSchema]).default(""), instagram: publicUrl, telegram: publicUrl, whatsapp: publicUrl, menuLinks: text(4000), homeRows: text(4000), ratingQuestions: text(4000), footerText: text(4000) }),
  notification: z.object({ topic: z.enum(notificationTopics), enabled: z.boolean().default(false), template: text(1000), provider: z.enum(["kavenegar","mellipayamak"]).default("kavenegar"), deliveryMode: z.enum(["TEXT","TEMPLATE"]).default("TEXT"), providerTemplate: z.string().regex(/^[A-Za-z0-9]{0,100}$/).default(""), templateApproved: z.boolean().default(false), inactiveDays: z.coerce.number().int().min(1).max(3650).default(90) }),
  integration: z.object({ provider: z.enum(["kavenegar","mellipayamak","baran","mahak","topin","ronad","torob","emalls","zarebin","goftino","raychat","yektanet"]), enabled: z.boolean().default(false), publicId: z.string().regex(/^[A-Za-z0-9_-]{0,100}$/).default(""), note: text(2000) }),
  gateway: z.object({ provider: z.literal("zarinpal").default("zarinpal"), merchantEnv: z.string().regex(/^ZARINPAL_MERCHANT_ID(?:_[A-Z0-9_]{1,50})?$/), sandbox: z.boolean().default(false) }),
} as const;
export type RecordKind = keyof typeof recordSchemas;
export const recordInput = z.object({ id: z.string().max(100).optional(), title: z.string().trim().min(1).max(200), slug: slugSchema, status: z.enum(["DRAFT","ACTIVE","ARCHIVED"]), version: z.number().int().min(0).default(0), data: z.record(z.string(),z.unknown()) });
export function ids(value: string) { return [...new Set(value.split(/[,\n،]/).map(v=>v.trim()).filter(Boolean))]; }
