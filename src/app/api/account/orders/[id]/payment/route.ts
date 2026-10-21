import { createHash } from "node:crypto";
import { z } from "zod";
import { authenticatedApi } from "@/modules/identity/api";
import { catalogOperation } from "@/modules/catalog/http";
import { getDatabase } from "@/infrastructure/database/server";
import { connectRedis } from "@/infrastructure/redis/client";
import { readJson } from "@/shared/http-input";
import { DomainError } from "@/shared/domain-error";
import { recoverCustomerPayment } from "@/modules/checkout/recovery";
import {resolveGateway,availableGateways} from "@/modules/payments/gateways";

const inputSchema = z.object({ action: z.enum(["check", "continue"]) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return authenticatedApi(request, identity => catalogOperation(async () => {
    const { action } = inputSchema.parse(await readJson(request));
    const { id } = await context.params;
    const payment=await getDatabase().paymentAttempt.findFirst({where:{orderId:id,order:{userId:identity.user.id}},orderBy:{createdAt:"desc"}});if(!payment)throw new DomainError("NOT_FOUND","پرداخت پیدا نشد.");
    const gateway=await resolveGateway(getDatabase(),payment.provider,true);
    // Cross-instance, per-customer cooldown; Redis failure closes the operation.
    const key = createHash("sha256").update(identity.user.id).digest("hex");
    if (!await (await connectRedis()).set(`payment:recovery:${key}`, "1", "EX", 30, "NX")) throw new DomainError("PAYMENT_CHECK_COOLDOWN", "برای بررسی دوبارهٔ پرداخت، ۳۰ ثانیه صبر کنید.");
    return recoverCustomerPayment(getDatabase(), identity.user.id, id, action, gateway.provider, { providerName: gateway.name, continuationEnabled: (await availableGateways(getDatabase())).some(g=>g.id===gateway.name) });
  }));
}
