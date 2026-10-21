import { createHmac } from "node:crypto";
import type Redis from "ioredis";

const consumeScript = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then return {0, math.max(redis.call('TTL', KEYS[1]), 1)} end
count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return {1, 0}
`;
const issueScript = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'digest', ARGV[1], 'attempts', 0)
redis.call('EXPIRE', KEYS[1], 180)
redis.call('SET', KEYS[2], '1', 'EX', 60)
return 1
`;
const verifyScript = `
local digest = redis.call('HGET', KEYS[1], 'digest')
if not digest then return 0 end
local attempts = tonumber(redis.call('HGET', KEYS[1], 'attempts') or '0')
if attempts >= 5 then redis.call('DEL', KEYS[1]); return 0 end
if digest == ARGV[1] then redis.call('DEL', KEYS[1]); return 1 end
attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if attempts >= 5 then redis.call('DEL', KEYS[1]) end
return 0
`;

export class RedisAuthStore {
  constructor(private readonly redis: () => Promise<Redis>, private readonly secret: string) {}

  private key(value: string) { return createHmac("sha256", this.secret).update(value).digest("hex"); }
  private otpKey(phone: string) { return `auth:otp:${this.key(phone)}`; }
  private digest(phone: string, code: string) { return this.key(`otp:${phone}:${code}`); }

  async consume(key: string, rule: { window: number; max: number }) {
    const redis = await this.redis();
    const [allowed, retry] = await redis.eval(consumeScript, 1, `auth:limit:${this.key(key)}`, rule.max, rule.window) as number[];
    return { allowed: allowed === 1, retryAfter: allowed === 1 ? null : retry };
  }

  async issue(phone: string, code: string) {
    const redis = await this.redis();
    const issued = await redis.eval(issueScript, 2, this.otpKey(phone), `${this.otpKey(phone)}:cooldown`, this.digest(phone, code));
    return issued === 1;
  }

  async verify(phone: string, code: string) {
    return await (await this.redis()).eval(verifyScript, 1, this.otpKey(phone), this.digest(phone, code)) === 1;
  }

  async discard(phone: string, code: string) {
    await (await this.redis()).eval(`if redis.call('HGET', KEYS[1], 'digest') == ARGV[1] then redis.call('DEL', KEYS[1], KEYS[2]) end; return 1`,
      2, this.otpKey(phone), `${this.otpKey(phone)}:cooldown`, this.digest(phone, code));
  }
}
