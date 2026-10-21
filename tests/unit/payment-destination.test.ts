import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentDestination } from "../../src/modules/payments/destination";
test("browser payment handoff accepts only exact provider invoice destinations", () => {
  const authority = "A" + "1".repeat(32);
  const valid = `https://payment.zarinpal.com/pg/StartPay/${authority}`;
  assert.equal(paymentDestination(valid), valid);
  for (const value of [undefined, "/account/orders", "https://evil.test/", valid.replace("https:", "http:"), valid.replace("payment.", "payment.evil."), valid.replace("https://", "https://name@"), `${valid}?redirect=evil`, `${valid}#fragment`, "https://payment.zarinpal.com/other-path"]) assert.throws(() => paymentDestination(value));
});
