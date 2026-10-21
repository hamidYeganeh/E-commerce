import { connection } from "next/server";
import { getDatabase } from "@/infrastructure/database/server";
import { authEnv } from "@/config/env";
import { verifyCheckout } from "@/modules/checkout/submit";
import {resolveGateway} from "@/modules/payments/gateways";
import { paymentSettings } from "@/modules/payments/zarinpal";
export async function GET(request: Request) {
  await connection();
  const settings = paymentSettings(), origin = authEnv().BETTER_AUTH_URL;
  const url = new URL(request.url), authority = url.searchParams.get("Authority");
  if (!authority || !/^[AS][a-zA-Z0-9]{20,80}$/.test(authority)) return Response.redirect(new URL("/account/orders?payment=review", origin), 303);
  const providerName = url.searchParams.get("gateway") ?? (settings.sandbox ? "zarinpal-sandbox" : "zarinpal");
  try {
    const payment = await getDatabase().paymentAttempt.findUnique({ where: { provider_authority: { provider: providerName, authority } } });
    if (!payment) return Response.redirect(new URL("/account/orders?payment=review", origin), 303);
    if (url.searchParams.get("Status") === "OK") {const gateway=await resolveGateway(getDatabase(),providerName,true);await verifyCheckout(getDatabase(),authority,gateway.provider,providerName);}
    // The destination renders authoritative DB state; no query parameter marks an order paid.
    return Response.redirect(new URL(`/account/orders/${payment.orderId}`, origin), 303);
  } catch { return Response.redirect(new URL("/account/orders?payment=review", origin), 303); }
}
