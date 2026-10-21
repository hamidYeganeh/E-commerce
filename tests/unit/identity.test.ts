import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, safeReturnPath } from "../../src/modules/identity/input";

test("Iranian phone spellings resolve to the same canonical account identifier", () => {
  for (const phone of ["۰۹۱۲ ۱۲۳ ۴۵۶۷", "09121234567", "00989121234567", "+98 (912) 123-4567", "989121234567"]) assert.equal(normalizePhone(phone), "+989121234567");
  for (const invalid of ["0912123456", "+1 9121234567", "091212345670", "<script>"]) assert.throws(() => normalizePhone(invalid));
});
test("login return paths cannot redirect to external destinations or API/auth loops", () => {
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/login", "/api/auth/sign-out", "/staff/login", "/x\r\nLocation:bad"]) assert.equal(safeReturnPath(value), "/account");
  assert.equal(safeReturnPath("/account?tab=orders"), "/account?tab=orders");
});

test("login return validation rejects decoded controls and normalized auth paths", () => {
  for (let code = 0; code <= 31; code++) assert.equal(safeReturnPath("/" + String.fromCharCode(code) + "/evil.example"), "/account");
  assert.equal(safeReturnPath("/" + String.fromCharCode(127) + "/evil.example"), "/account");
  const next = new URLSearchParams("next=%2F%09%2Fevil.example").get("next");
  assert.equal(safeReturnPath(next), "/account");
  for (const path of ["/shop/../api/auth/sign-out", "/shop/%2e%2e/login", "/staff/login#challenge", "/login#again"]) assert.equal(safeReturnPath(path), "/account");
  assert.equal(safeReturnPath("/checkout"), "/checkout");
  assert.equal(safeReturnPath("/account/orders?payment=review#result"), "/account/orders?payment=review#result");
});
