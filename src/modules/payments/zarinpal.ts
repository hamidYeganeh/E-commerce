import { z } from "zod";
import { DomainError } from "../../shared/domain-error";
import type { PaymentProvider } from "./provider";
const authoritySchema = z.string().regex(/^[AS][a-zA-Z0-9]{20,80}$/);
export function paymentSettings() {
  const merchant = z.uuid().safeParse(process.env.ZARINPAL_MERCHANT_ID);
  const shipping = /^\d{1,12}$/.test(process.env.SHIPPING_FLAT_RIAL ?? "") ? BigInt(process.env.SHIPPING_FLAT_RIAL!) : null;
  const sandbox = process.env.ZARINPAL_SANDBOX === "true";
  return { merchantId: merchant.success ? merchant.data : null, shippingRial: shipping, sandbox, enabled: process.env.CHECKOUT_ENABLED === "true" && merchant.success && shipping !== null && (sandbox || process.env.NODE_ENV === "production") };
}
export class ZarinpalProvider implements PaymentProvider {
  constructor(private merchantId: string, private sandbox: boolean, private transport: typeof fetch = fetch) {}
  private get host() { return this.sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com"; }
  private amount(value: bigint) { if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new DomainError("INVALID_AMOUNT", "مبلغ پرداخت معتبر نیست."); return Number(value); }
  private async request(method: string, body: Record<string, unknown>) {
    const response = await this.transport(`${this.host}/pg/v4/payment/${method}.json`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ merchant_id: this.merchantId, ...body }), signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store" });
    if (!response.ok && response.status >= 500) throw new Error("PAYMENT_PROVIDER_UNAVAILABLE");
    return response.json() as Promise<{ data?: { code?: number; authority?: string; ref_id?: number | string; status?: string }; errors?: { code?: number } }>;
  }
  redirect(authority: string) { return `${this.host}/pg/StartPay/${authoritySchema.parse(authority)}`; }
  async createPayment(input: Parameters<PaymentProvider["createPayment"]>[0]) {
    const result = await this.request("request", { amount: this.amount(input.amountRial), currency: "IRR", description: `سفارش فروشگاه ${input.paymentId}`, callback_url: input.callbackUrl });
    if (result.data?.code !== 100) {
      const code = result.errors?.code ?? result.data?.code;
      if (typeof code === "number" && code < 0) throw new DomainError("PAYMENT_REQUEST_REJECTED", "درگاه درخواست پرداخت را نپذیرفت؛ رزرو سفارش آزاد شد.");
      throw new Error("PAYMENT_REQUEST_UNCERTAIN");
    }
    const authority = authoritySchema.parse(result.data.authority);
    return { authority, redirectUrl: this.redirect(authority) };
  }
  async verifyPayment(input: Parameters<PaymentProvider["verifyPayment"]>[0]): ReturnType<PaymentProvider["verifyPayment"]> {
    authoritySchema.parse(input.authority);
    try {
      const result = await this.request("verify", { authority: input.authority, amount: this.amount(input.expectedAmountRial) });
      if ([100, 101].includes(result.data?.code ?? 0) && result.data?.ref_id && /^\d+$/.test(String(result.data.ref_id))) return { status: "verified", transactionId: String(result.data.ref_id), amountRial: input.expectedAmountRial };
      const inquiry = await this.request("inquiry", { authority: input.authority });
      if (inquiry.data?.code === 100 && ["FAILED", "REVERSED"].includes(inquiry.data.status ?? "")) return { status: "failed", code: inquiry.data.status! };
      return { status: "unknown" }; // An ambiguous provider response never proves that no funds were debited.
    } catch { return { status: "unknown" }; }
  }
}
