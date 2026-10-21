import { authenticatedApi } from "@/modules/identity/api";
import { catalogOperation } from "@/modules/catalog/http";
import { getDatabase } from "@/infrastructure/database/server";
import { authEnv } from "@/config/env";
import { readJson } from "@/shared/http-input";
import { DomainError } from "@/shared/domain-error";
import { submitCheckout } from "@/modules/checkout/submit";
import {resolveGateway} from "@/modules/payments/gateways";
import {checkoutSchema} from "@/modules/checkout/submit";
import { paymentSettings } from "@/modules/payments/zarinpal";
export async function POST(request: Request) {
  return authenticatedApi(request, identity => catalogOperation(async () => {
    const settings=paymentSettings(),db=getDatabase(),input=checkoutSchema.parse(await readJson(request));
    if(process.env.CHECKOUT_ENABLED!=="true")throw new DomainError("PAYMENT_NOT_CONFIGURED","ثبت سفارش هنوز فعال نشده است.");
    const gateway=input.expectedTotalRial==="0"?{name:"coupon",provider:{createPayment:async()=>{throw new Error("ZERO_TOTAL_ONLY");},verifyPayment:async()=>({status:"unknown" as const}),redirect:()=>{throw new Error("ZERO_TOTAL_ONLY");}}}:await resolveGateway(db,input.gatewayId);
    const callback=new URL("/api/payments/zarinpal/callback",authEnv().BETTER_AUTH_URL);callback.searchParams.set("gateway",gateway.name);
    if(settings.shippingRial===null&&!await db.storeRecord.count({where:{kind:"shipping",status:"ACTIVE"}}))throw new DomainError("SHIPPING_NOT_CONFIGURED","روش ارسال هنوز تنظیم نشده است.");
    return submitCheckout(db,identity.user.id,input,gateway.provider,{shippingRial:settings.shippingRial??0n,callbackUrl:callback.href,providerName:gateway.name});
  }));
}
