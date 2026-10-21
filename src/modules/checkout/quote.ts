import {cartDiscount} from "./discounts";
import {availableGateways} from "../payments/gateways";
import { shippingOptions } from "../operations/commerce";
import { purchasePolicy } from "../catalog/purchase-policy";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { getLookups, productInclude, publicProduct, visibleCategoryIds } from "../catalog/repository";
import { paymentSettings } from "../payments/zarinpal";
import { cartLinesSchema } from "./contracts";

// A quote never reserves stock or trusts money supplied by the browser.
export async function quoteCart(db: PrismaClient, input: unknown, options?: {userId:string;address:{province:string;city:string};shippingMethodId?:string;couponCode?:string}) {
  const lines = cartLinesSchema.parse(input);
  return db.$transaction(async tx => {
    const lookups = await getLookups(tx);
    const policy = purchasePolicy(visibleCategoryIds(lookups.categories));
    const variants = await tx.productVariant.findMany({ where: { id: { in: lines.map(l => l.variantId) } }, include: { stock: true, product: { include: productInclude } } });
    const items = lines.map(line => {
      const variant = variants.find(v => v.id === line.variantId);
      if (!policy.allowsVariant(variant)) return { ...line, available: false as const, product: null, variant: null, lineTotalRial: "0", reason: "این محصول دیگر قابل خرید نیست." };
      const p = variant.product;
      const available = !!variant.stock && variant.stock.onHand - variant.stock.reserved >= line.quantity;
      const product = publicProduct(p, lookups);
      return { ...line, available, product: { name: p.name, slug: p.slug, image: product.media[0] }, variant: { name: variant.name, priceRial: variant.priceRial.toString() }, lineTotalRial: (variant.priceRial * BigInt(line.quantity)).toString(), reason: available ? null : "موجودی این تنوع برای تعداد انتخاب‌شده کافی نیست." };
    });
    const settings = paymentSettings();const gateways=await availableGateways(tx);
    const subtotal = items.reduce((sum, i) => sum + BigInt(i.lineTotalRial), 0n);
    const methods=options?await shippingOptions(tx,options.address,subtotal,variants.map(v=>({quantity:lines.find(l=>l.variantId===v.id)!.quantity,shippingWeightGrams:v.shippingWeightGrams,netWeightGrams:v.netWeightGrams}))):[];
    const hasMethods=options?await tx.storeRecord.count({where:{kind:"shipping",status:"ACTIVE"}}):0;
    const selected=methods.find(m=>m.id===options?.shippingMethodId)??(!options?.shippingMethodId?methods[0]:undefined);
    const shipping=hasMethods?(selected?BigInt(selected.feeRial):null):settings.shippingRial;
    const coupon=await cartDiscount(tx,options?.userId,options?.couponCode,subtotal,items.filter(i=>i.variant!==null).map(i=>({variantId:i.variantId,quantity:i.quantity,unitPriceRial:BigInt(i.variant!.priceRial),totalRial:BigInt(i.lineTotalRial)})));
    return { items, subtotalRial: subtotal.toString(), valid: items.every(i => i.available) && (!hasMethods||!!selected), paymentEnabled: gateways.length>0||(process.env.CHECKOUT_ENABLED==="true"&&shipping!==null&&subtotal-coupon.discount+shipping===0n),gateways, shippingRial: shipping?.toString() ?? null, discountRial:coupon.discount.toString(), shippingMethods:methods, shippingMethodId:selected?.id, totalRial: shipping !== null ? (subtotal-coupon.discount+shipping).toString() : null, message: hasMethods&&!selected?"برای نشانی شما روش ارسال فعالی وجود ندارد.":"قیمت، تخفیف و موجودی در سرور بررسی شده‌اند." };

  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export type CartQuote = Awaited<ReturnType<typeof quoteCart>>;
