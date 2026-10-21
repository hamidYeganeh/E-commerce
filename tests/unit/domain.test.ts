import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCategoryParent, normalizeTagName } from "../../src/modules/catalog/taxonomy";
import { calculateTotals } from "../../src/modules/checkout/pricing";
import { availableQuantity } from "../../src/modules/inventory/policy";
import { assertOrderTransition } from "../../src/modules/orders/policy";

test("category ancestry rejects indirect cycles and missing parents", () => {
  const nodes = [{ id: "food", parentId: null }, { id: "honey", parentId: "food" }, { id: "mountain", parentId: "honey" }];
  assert.throws(() => assertCategoryParent(nodes, "food", "mountain"), { code: "CATEGORY_CYCLE" });
  assert.throws(() => assertCategoryParent(nodes, "honey", "honey"), { code: "CATEGORY_CYCLE" });
  assert.throws(() => assertCategoryParent(nodes, "honey", "missing"), { code: "CATEGORY_NOT_FOUND" });
  assert.doesNotThrow(() => assertCategoryParent(nodes, "mountain", "food"));
  assert.doesNotThrow(() => assertCategoryParent(nodes, "honey", null));
});

test("Persian tags normalize Arabic letters, spacing and zero-width joiners", () => {
  assert.equal(normalizeTagName("  كيك\u200cخانگي  "), normalizeTagName("کیک خانگی"));
});

test("pricing stays exact for values beyond Number.MAX_SAFE_INTEGER", () => {
  const result = calculateTotals([{ unitPriceRial: 9007199254740993n, quantity: 2 }], 1n, 100n);
  assert.equal(result.totalRial, 18014398509482085n);
});

test("pricing rejects empty carts, fractional quantities and over-discounting", () => {
  assert.throws(() => calculateTotals([]), { code: "EMPTY_CART" });
  assert.throws(() => calculateTotals([{ unitPriceRial: 100n, quantity: 1.2 }]), { code: "INVALID_LINE" });
  assert.throws(() => calculateTotals([{ unitPriceRial: 100n, quantity: 1 }], 101n), { code: "INVALID_TOTALS" });
});

test("reserved stock is unavailable and inconsistent balances are rejected", () => {
  assert.equal(availableQuantity(10, 3), 7);
  assert.equal(availableQuantity(1, 1), 0);
  assert.throws(() => availableQuantity(1, 2), { code: "INVALID_STOCK" });
  assert.throws(() => availableQuantity(-1, 0), { code: "INVALID_STOCK" });
});

test("orders require payment verification and delivery evidence", () => {
  assert.throws(() => assertOrderTransition("AWAITING_PAYMENT", "CONFIRMED"), { code: "PAYMENT_NOT_VERIFIED" });
  assert.doesNotThrow(() => assertOrderTransition("AWAITING_PAYMENT", "CONFIRMED", { paymentVerified: true }));
  assert.throws(() => assertOrderTransition("PROCESSING", "COMPLETED"), { code: "NOT_DELIVERED" });
  assert.doesNotThrow(() => assertOrderTransition("PROCESSING", "COMPLETED", { allDelivered: true }));
  assert.throws(() => assertOrderTransition("PROCESSING", "CANCELLED", { anyShipped: true }), { code: "ALREADY_SHIPPED" });
  assert.throws(() => assertOrderTransition("CANCELLED", "CONFIRMED", { paymentVerified: true }), { code: "INVALID_ORDER_TRANSITION" });
});
