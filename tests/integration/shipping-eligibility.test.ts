import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "../helpers/database";
import { shippingOptions, resolveShipping } from "../../src/modules/operations/commerce";

let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
const address = { province: "تهران", city: "تهران" };

before(async () => {
  fixture = await createTestDatabase();
  await fixture.client.storeRecord.createMany({ data: [
    { kind: "shipping", title: "Flat capped", slug: "flat-capped", status: "ACTIVE", data: { mode: "FLAT", maxWeightGrams: 1000 } },
    { kind: "shipping", title: "Percent capped", slug: "percent-capped", status: "ACTIVE", data: { mode: "PERCENT", maxWeightGrams: 1000, percentage: 10 } },
    { kind: "shipping", title: "Weight based", slug: "weight-based", status: "ACTIVE", data: { mode: "WEIGHT", perKgRial: "10000" } },
    { kind: "shipping", title: "Flat unrestricted", slug: "flat-unrestricted", status: "ACTIVE", data: { mode: "FLAT", baseRial: "20000" } },
  ] });
});
after(async () => { await fixture?.close(); });

test("unknown weights cannot bypass capped flat or percentage shipping", async () => {
  const lines = [{ quantity: 1, shippingWeightGrams: null, netWeightGrams: null }];
  const methods = await shippingOptions(fixture.client, address, 1000000n, lines);
  assert.deepEqual(methods.map(method => method.name), ["Flat unrestricted"]);
  const capped = await fixture.client.storeRecord.findUniqueOrThrow({ where: { kind_slug: { kind: "shipping", slug: "flat-capped" } } });
  await assert.rejects(resolveShipping(fixture.client, capped.id, address, 1000000n, lines, 0n), { code: "SHIPPING_UNAVAILABLE" });
});

test("known weights enforce the cap using quantity and keep net-weight fallback", async () => {
  const under = await shippingOptions(fixture.client, address, 1000000n, [{ quantity: 2, shippingWeightGrams: null, netWeightGrams: 500 }]);
  assert.equal(under.length, 4);
  const over = await shippingOptions(fixture.client, address, 1000000n, [{ quantity: 3, shippingWeightGrams: 500, netWeightGrams: null }]);
  assert.deepEqual(over.map(method => method.name), ["Flat unrestricted", "Weight based"]);
  assert.equal(over.find(method => method.name === "Weight based")?.feeRial, "20000");
});

test("one unknown line cannot hide behind a known line when weight is required", async () => {
  const methods = await shippingOptions(fixture.client, address, 1000000n, [
    { quantity: 1, shippingWeightGrams: 200, netWeightGrams: null },
    { quantity: 1, shippingWeightGrams: null, netWeightGrams: null },
  ]);
  assert.deepEqual(methods.map(method => method.name), ["Flat unrestricted"]);
});
