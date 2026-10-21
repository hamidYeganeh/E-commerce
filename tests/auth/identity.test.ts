import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "../helpers/database";
import { createTestRedis } from "../helpers/redis";
import { seedFoundation } from "../../prisma/seed-data";
import { createCommerceAuth, type CommerceAuth } from "../../src/modules/identity/auth";
import { handleAuthRequest } from "../../src/modules/identity/http";
import { RedisAuthStore } from "../../src/infrastructure/redis/auth-store";
import { createStaffAccount } from "../../src/modules/identity/staff";
import { assertStaff, resolveIdentity } from "../../src/modules/identity/session";
import { KavenegarSms } from "../../src/infrastructure/sms/kavenegar";
import { createHmac } from "node:crypto";

const origin = "http://localhost:3000";
const secret = "isolated-auth-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const staffPassword = "Test-password-123456789";
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let redis: Awaited<ReturnType<typeof createTestRedis>>;
let auth: CommerceAuth;
const sent = new Map<string, string>();
let staffId: string;
let recoveryCodes: string[];
let verifiedStaffBrowser: Browser;
let ip = 0;

class Browser {
  private cookies = new Map<string, string>();
  private address = `192.0.2.${++ip}`;
  headers() { return new Headers({ cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "), origin, "x-real-ip": this.address }); }
  async call(path: string, body?: Record<string, unknown>, requestOrigin = origin) {
    const headers = this.headers(); headers.set("origin", requestOrigin);
    if (body) headers.set("content-type", "application/json");
    const response = await handleAuthRequest(auth, new Request(`${origin}/api/auth${path}`, { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) }), origin);
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0]; const at = pair.indexOf("=");
      if (at > 0) this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return { response, data: await response.json() };
  }
}

before(async () => {
  database = await createTestDatabase();
  redis = await createTestRedis();
  await seedFoundation(database.client);
  auth = createCommerceAuth(database.client, new RedisAuthStore(async () => redis.client, secret), {
    async sendCode(phone, code) { sent.set(phone, code); },
  }, { origin, secret, ipHeader: "x-real-ip" });
  staffId = (await createStaffAccount(database.client, { email: "owner@example.com", name: "Owner", role: "owner", password: staffPassword })).id;
});
after(async () => { await redis?.close(); await database?.close(); });

test("customer SMS login canonicalizes Persian input, never stores raw OTP, and consumes a code once", async () => {
  const browser = new Browser();
  const issued = await browser.call("/phone-number/send-otp", { phoneNumber: "۰۹۱۲ ۱۲۳ ۴۵۶۷" });
  assert.equal(issued.response.status, 200, JSON.stringify(issued.data));
  const code = sent.get("+989121234567"); assert.ok(code);
  const rows = await database.client.verification.findMany({ where: { identifier: "+989121234567" } });
  assert.equal(rows[0].value, "redis-managed");
  const keys = await redis.client.keys("auth:otp:*");
  for (const key of keys.filter((key) => !key.endsWith(":cooldown"))) assert.ok(!JSON.stringify(await redis.client.hgetall(key)).includes(code));
  const verified = await browser.call("/phone-number/verify", { phoneNumber: "00989121234567", code });
  assert.equal(verified.response.status, 200, JSON.stringify(verified.data));
  assert.ok(verified.response.headers.getSetCookie().some((cookie) => /httponly/i.test(cookie)));
  assert.equal(verified.response.headers.get("cache-control"), "no-store");
  const identity = await resolveIdentity(database.client, auth, browser.headers());
  assert.equal(identity.user.phoneNumber, "+989121234567");
  assert.equal(identity.authMethod, "CUSTOMER"); assert.equal(identity.roles.length, 0);
  assert.throws(() => assertStaff(identity), { code: "FORBIDDEN" });
  const replay = await browser.call("/phone-number/verify", { phoneNumber: "+989121234567", code });
  assert.equal(replay.response.status, 400);
  assert.equal((await browser.call("/phone-number/send-otp", { phoneNumber: "09121234567" })).response.status, 429);
});

test("OTP attempts are bounded and cannot escalate fields through phone signup", async () => {
  const browser = new Browser();
  await browser.call("/phone-number/send-otp", { phoneNumber: "09121111111" });
  const correct = sent.get("+989121111111")!;
  const wrong = correct === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await browser.call("/phone-number/verify", { phoneNumber: "09121111111", code: wrong })).response.status, 400);
  assert.equal((await browser.call("/phone-number/verify", { phoneNumber: "09121111111", code: correct })).response.status, 400);
  assert.equal(await database.client.user.count({ where: { phoneNumber: "+989121111111" } }), 0);
  await browser.call("/phone-number/send-otp", { phoneNumber: "09122222222" });
  const spoof = await browser.call("/phone-number/verify", { phoneNumber: "09122222222", code: sent.get("+989122222222"), twoFactorEnabled: true });
  assert.notEqual(spoof.response.status, 200);
  assert.equal(await database.client.user.count({ where: { phoneNumber: "+989122222222", twoFactorEnabled: true } }), 0);
});

test("staff requires enrollment and MFA per session, then receives an eight-hour administrative session", async () => {
  const browser = new Browser();
  const passwordLogin = await browser.call("/sign-in/email", { email: "OWNER@example.com", password: staffPassword });
  assert.equal(passwordLogin.response.status, 200, JSON.stringify(passwordLogin.data));
  let identity = await resolveIdentity(database.client, auth, browser.headers());
  assert.equal(identity.authMethod, "STAFF_PASSWORD");
  assert.throws(() => assertStaff(identity), { code: "MFA_REQUIRED" });
  assert.doesNotThrow(() => assertStaff(identity, undefined, true));
  const setup = await browser.call("/two-factor/enable", { password: staffPassword });
  assert.equal(setup.response.status, 200, JSON.stringify(setup.data));
  recoveryCodes = setup.data.backupCodes;
  assert.equal((await browser.call("/two-factor/generate-backup-codes", { password: staffPassword })).response.status, 403);
  const code = authenticatorCode(setup.data.totpURI);
  const factor = await browser.call("/two-factor/verify-totp", { code });
  assert.equal(factor.response.status, 200, JSON.stringify(factor.data));
  identity = await resolveIdentity(database.client, auth, browser.headers());
  assert.equal(identity.authMethod, "STAFF_MFA"); assert.ok(identity.mfaVerifiedAt);
  assert.doesNotThrow(() => assertStaff(identity, "staff.manage"));
  assert.ok(identity.expiresAt.getTime() - Date.now() <= 8 * 3600000);

  await browser.call("/sign-out", {});
  await assert.rejects(resolveIdentity(database.client, auth, browser.headers()), { code: "UNAUTHENTICATED" });
  const challenge = await browser.call("/sign-in/email", { email: "owner@example.com", password: staffPassword });
  assert.equal(challenge.data.twoFactorRedirect, true);
  await assert.rejects(resolveIdentity(database.client, auth, browser.headers()), { code: "UNAUTHENTICATED" });
  const retry = await browser.call("/two-factor/verify-totp", { code });
  assert.equal(retry.response.status, 200, JSON.stringify(retry.data));
  const current = await resolveIdentity(database.client, auth, browser.headers());
  assert.doesNotThrow(() => assertStaff(current));
  verifiedStaffBrowser = browser;
});

// Independent authenticator implementation for checking the actual QR/manual enrollment URI.
function authenticatorCode(uri: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const encoded = new URL(uri).searchParams.get("secret")!;
  let bits = "";
  for (const char of encoded) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}

test("backup codes restore a challenged staff session once and cannot be replayed", async () => {
  const browser = new Browser();
  const challenge = await browser.call("/sign-in/email", { email: "owner@example.com", password: staffPassword });
  assert.equal(challenge.data.twoFactorRedirect, true);
  const result = await browser.call("/two-factor/verify-backup-code", { code: recoveryCodes[0] });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  const identity = await resolveIdentity(database.client, auth, browser.headers());
  assert.doesNotThrow(() => assertStaff(identity));
  const attacker = new Browser();
  await attacker.call("/sign-in/email", { email: "owner@example.com", password: staffPassword });
  assert.equal((await attacker.call("/two-factor/verify-backup-code", { code: recoveryCodes[0] })).response.status, 401);
  await assert.rejects(resolveIdentity(database.client, auth, attacker.headers()), { code: "UNAUTHENTICATED" });
});

test("permissions are refreshed from the database even for an already MFA-verified session", async () => {
  const db = database.client;
  const support = await db.role.findUniqueOrThrow({ where: { key: "support" } });
  const owner = await db.role.findUniqueOrThrow({ where: { key: "owner" } });
  await db.userRole.deleteMany({ where: { userId: staffId } });
  await db.userRole.create({ data: { userId: staffId, roleId: support.id } });
  try {
    const identity = await resolveIdentity(db, auth, verifiedStaffBrowser.headers());
    assert.doesNotThrow(() => assertStaff(identity, "orders.read"));
    assert.throws(() => assertStaff(identity, "catalog.write"), { code: "FORBIDDEN" });
    assert.throws(() => assertStaff(identity, "staff.manage"), { code: "FORBIDDEN" });
  } finally {
    await db.userRole.deleteMany({ where: { userId: staffId } });
    await db.userRole.create({ data: { userId: staffId, roleId: owner.id } });
  }
});

test("concurrent requests cannot consume the same phone OTP twice", async () => {
  const issuer = new Browser();
  await issuer.call("/phone-number/send-otp", { phoneNumber: "09126666666" });
  const code = sent.get("+989126666666");
  const a = new Browser(), b = new Browser();
  const results = await Promise.all([a.call("/phone-number/verify", { phoneNumber: "09126666666", code }), b.call("/phone-number/verify", { phoneNumber: "09126666666", code })]);
  assert.deepEqual(results.map(({ response }) => response.status).sort(), [200, 400]);
  assert.equal(await database.client.user.count({ where: { phoneNumber: "+989126666666" } }), 1);
});

test("customers cannot promote existing SMS sessions to staff or enroll staff MFA", async () => {
  const browser = new Browser();
  await browser.call("/phone-number/send-otp", { phoneNumber: "09123333333" });
  const verified = await browser.call("/phone-number/verify", { phoneNumber: "09123333333", code: sent.get("+989123333333") });
  assert.equal(verified.response.status, 200);
  const identity = await resolveIdentity(database.client, auth, browser.headers());
  const owner = await database.client.role.findUniqueOrThrow({ where: { key: "owner" } });
  await database.client.userRole.create({ data: { userId: identity.user.id, roleId: owner.id } });
  const promoted = await resolveIdentity(database.client, auth, browser.headers());
  assert.throws(() => assertStaff(promoted), { code: "FORBIDDEN" });
  assert.equal((await browser.call("/two-factor/enable", { password: staffPassword })).response.status, 403);
  assert.equal((await browser.call("/phone-number/send-otp", { phoneNumber: "09123333333" })).response.status, 403);
});

test("revocation and account disabling invalidate authoritative sessions immediately", async () => {
  for (const [phone, action] of [["09124444444", "revoke"], ["09125555555", "disable"]]) {
    const browser = new Browser();
    await browser.call("/phone-number/send-otp", { phoneNumber: phone });
    await browser.call("/phone-number/verify", { phoneNumber: phone, code: sent.get(`+98${phone.slice(1)}`) });
    const identity = await resolveIdentity(database.client, auth, browser.headers());
    if (action === "revoke") await database.client.session.deleteMany({ where: { userId: identity.user.id } });
    else await database.client.user.update({ where: { id: identity.user.id }, data: { disabledAt: new Date() } });
    await assert.rejects(resolveIdentity(database.client, auth, browser.headers()), { code: "UNAUTHENTICATED" });
  }
});

test("auth HTTP boundary rejects cross-site writes and unexposed password/reset/signup routes", async () => {
  const browser = new Browser();
  assert.equal((await browser.call("/sign-in/email", { email: "owner@example.com", password: staffPassword }, "https://attacker.example")).response.status, 403);
  for (const path of ["/sign-up/email", "/sign-in/phone-number", "/phone-number/reset-password", "/two-factor/disable", "/totp/generate"]) {
    assert.equal((await browser.call(path, {})).response.status, 404);
  }
  const response = await handleAuthRequest(auth, new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ padding: "x".repeat(9000) }) }), origin);
  assert.equal(response.status, 413);
});

test("Kavenegar adapter uses lookup template and sanitizes failures", async () => {
  let requested = false;
  const sms = new KavenegarSms("test-only-key", "login", async (url, options) => {
    assert.equal(String(url), "https://api.kavenegar.com/v1/test-only-key/verify/lookup.json");
    const params = options?.body as URLSearchParams;
    assert.equal(params.get("receptor"), "09121234567"); assert.equal(params.get("token"), "123456"); assert.equal(params.get("template"), "login");
    requested = true;
    return Response.json({ return: { status: 200 } });
  });
  await sms.sendCode("+989121234567", "123456"); assert.ok(requested);
  const failing = new KavenegarSms("test-only-key", "login", async () => { throw new Error("contains test-only-key"); });
  await assert.rejects(failing.sendCode("+989121234567", "123456"), { message: "SMS_DELIVERY_FAILED" });
  assert.ok(staffId);
});
