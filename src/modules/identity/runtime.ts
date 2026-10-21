import "server-only";
import { authEnv } from "../../config/env";
import { getDatabase } from "../../infrastructure/database/client";
import { connectRedis } from "../../infrastructure/redis/client";
import { RedisAuthStore } from "../../infrastructure/redis/auth-store";
import { KavenegarSms } from "../../infrastructure/sms/kavenegar";
import { createCommerceAuth, type CommerceAuth } from "./auth";

let auth: CommerceAuth | undefined;
export function getAuth() {
  if (!auth) {
    const env = authEnv();
    auth = createCommerceAuth(getDatabase(), new RedisAuthStore(connectRedis, env.BETTER_AUTH_SECRET),
      new KavenegarSms(env.KAVENEGAR_API_KEY ?? "", env.KAVENEGAR_OTP_TEMPLATE ?? ""),
      { origin: new URL(env.BETTER_AUTH_URL).origin, secret: env.BETTER_AUTH_SECRET, ipHeader: env.AUTH_IP_HEADER });
  }
  return auth;
}
