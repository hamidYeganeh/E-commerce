import { z } from "zod";
import { asciiDigits, phoneSchema } from "../identity/input";

export const cartLinesSchema = z.array(z.object({
  variantId: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(20),
})).min(1).max(20).refine(lines => new Set(lines.map(l => l.variantId)).size === lines.length, "تنوع تکراری است.");

export const addressSchema = z.object({
  recipientName: z.string().trim().min(3).max(100),
  phoneNumber: phoneSchema,
  province: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  addressLine: z.string().trim().min(10).max(500),
  postalCode: z.string().transform(asciiDigits).pipe(z.string().regex(/^\d{10}$/)),
});
export type DeliveryAddress = z.input<typeof addressSchema>;
export type CartLine = z.infer<typeof cartLinesSchema>[number];
