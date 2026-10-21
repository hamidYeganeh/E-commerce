import {z} from "zod";
export const bundleSchema=z.object({priceRial:z.string().regex(/^\d{1,16}$/),items:z.array(z.object({variantId:z.string(),quantity:z.number().int().min(1).max(20)})).min(2).max(20)}).refine(d=>new Set(d.items.map(i=>i.variantId)).size===d.items.length);
