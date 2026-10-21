import { z } from "zod";

export const slugSchema = z.string().trim().min(1).max(160).regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, "نامک فقط شامل حروف، عدد و خط تیره است.");
const name = z.string().trim().min(1).max(160);
const optionalText = (max: number) => z.string().trim().max(max).default("");
export const categorySchema = z.object({
  name, slug: slugSchema, parentId: z.string().min(1).nullable().default(null),
  description: optionalText(4000), seoTitle: optionalText(160), seoDescription: optionalText(320),
  isActive: z.boolean().default(true), position: z.number().int().min(0).max(100000).default(0),
  attributes: z.array(z.object({ attributeId: z.string().min(1), isRequired: z.boolean(), isVariant: z.boolean(), isFilterable: z.boolean() })).max(40).default([]),
});
export const tagSchema = z.object({ name, slug: slugSchema, description: optionalText(4000), seoTitle: optionalText(160), seoDescription: optionalText(320), isIndexable: z.boolean().default(false) });
export const brandSchema = z.object({ name, slug: slugSchema, description: optionalText(4000) });
export const attributeSchema = z.object({
  name, key: slugSchema, type: z.enum(["TEXT", "NUMBER", "BOOLEAN", "SELECT"]), unit: optionalText(30),
  options: z.array(z.object({ value: name, label: name })).max(100).default([]),
}).superRefine((v, ctx) => {
  if ((v.type === "SELECT") !== (v.options.length > 0)) ctx.addIssue({ code: "custom", message: "ویژگی انتخابی باید گزینه داشته باشد؛ سایر نوع‌ها گزینه ندارند." });
  if (new Set(v.options.map((o) => o.value)).size !== v.options.length) ctx.addIssue({ code: "custom", message: "گزینه‌ها باید یکتا باشند." });
});
export const valueSchema = z.object({ attributeId: z.string().min(1), value: z.string().trim().min(1).max(500) });
const weight = z.number().int().positive().max(10000000).nullable().default(null);
export const priceRialSchema = z.string().regex(/^\d{1,16}$/).refine((value) => BigInt(value) <= 9000000000000000n);
export const variantSchema = z.object({
  id: z.string().min(1).optional(), name, sku: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
  barcode: optionalText(64), priceRial: priceRialSchema,
  netWeightGrams: weight, shippingWeightGrams: weight, isActive: z.boolean(),
  attributes: z.array(valueSchema).max(40).default([]),
});
export const productSchema = z.object({
  name, slug: slugSchema, description: optionalText(20000), brandId: z.string().min(1).nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]), version: z.number().int().min(0),
  seoTitle: optionalText(160), seoDescription: optionalText(320),
  categoryIds: z.array(z.string().min(1)).max(30), primaryCategoryId: z.string().min(1).nullable(),
  tagIds: z.array(z.string().min(1)).max(40), attributes: z.array(valueSchema).max(40),
  variants: z.array(variantSchema).min(1).max(50),
  media: z.array(z.object({ objectKey: z.string().regex(/^[a-f0-9-]{36}\.(png|jpg|webp)$/), alt: name })).max(12),
});
export const stockSchema = z.object({
  version: z.number().int().min(0), onHand: z.number().int().min(0).max(10000000),
  reason: z.string().trim().min(3).max(500), eventKey: z.uuid(),
});
export type ProductInput = z.infer<typeof productSchema>;
export type AttributeValueInput = z.infer<typeof valueSchema>;
export type CategoryRule = { categoryId: string; attributeId: string; isRequired: boolean; isVariant: boolean; isFilterable: boolean };
export type AttributeDefinition = { id: string; name: string; key: string; type: string; unit: string | null; options: { id: string; value: string; label: string }[] };
export type CatalogLookups = {
  categories: { id: string; name: string; slug: string; parentId: string | null; isActive: boolean; position: number; description: string | null; seoTitle: string | null; seoDescription: string | null; attributes: CategoryRule[] }[];
  tags: { id: string; name: string; slug: string; description: string | null; seoTitle: string | null; seoDescription: string | null; isIndexable: boolean }[];
  brands: { id: string; name: string; slug: string; description: string | null }[];
  attributes: AttributeDefinition[];
};
