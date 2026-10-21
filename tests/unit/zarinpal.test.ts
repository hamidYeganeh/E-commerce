import { test } from "node:test";
import assert from "node:assert/strict";
import { ZarinpalProvider } from "../../src/modules/payments/zarinpal";
test("Zarinpal uses exact rial amounts, allowlisted hosts and server verification", async () => {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const authority = "S" + "0".repeat(32);
  const transport = (async (url, init) => { requests.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json({ data: requests.length === 1 ? { code: 100, authority } : { code: 101, ref_id: 321 } }); }) as typeof fetch;
  const provider = new ZarinpalProvider("00000000-0000-4000-8000-000000000000", true, transport);
  const result = await provider.createPayment({ amountRial: 1600000n, callbackUrl: "https://example.test/callback", paymentId: "test", idempotencyKey: "test" });
  assert.equal(requests[0].url, "https://sandbox.zarinpal.com/pg/v4/payment/request.json");
  assert.equal(requests[0].body.amount, 1600000); assert.equal(requests[0].body.currency, "IRR");
  assert.equal(result.redirectUrl, `https://sandbox.zarinpal.com/pg/StartPay/${authority}`);
  assert.equal((await provider.verifyPayment({ authority, expectedAmountRial: 1600000n })).status, "verified");
  await assert.rejects(provider.verifyPayment({ authority: "https://malicious.test", expectedAmountRial: 1n }));
});
test("ambiguous provider responses never mark a payment successful", async () => {
  const provider = new ZarinpalProvider("00000000-0000-4000-8000-000000000000", true, (async () => { throw new Error("timeout"); }) as typeof fetch);
  assert.equal((await provider.verifyPayment({ authority: "S" + "0".repeat(32), expectedAmountRial: 1000000n })).status, "unknown");
});
