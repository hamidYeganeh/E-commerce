import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { processNotifications, queueNotification } from "../../src/modules/operations/notifications";

let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
let phone = 2000000;
const staffPhone = "+989123456789";
before(async () => {
  fixture = await createTestDatabase();
  await fixture.client.storeRecord.createMany({ data: ["wallet.credited", "order.paid", "staff.neworder", "staff.ready"].map(topic => ({
    kind: "notification", title: topic, slug: topic.replace(".", "-"), status: "ACTIVE", data: { topic, enabled: true, template: "آزمایشی", provider: "kavenegar" },
  })) });
  await fixture.client.storeRecord.create({ data: { kind: "settings", title: "Shop", slug: "shop", status: "ACTIVE", data: { orderPhone: staffPhone } } });
});
after(async () => { await fixture?.close(); });

async function customer() {
  return fixture.client.user.create({ data: { name: "آزمایشی", phoneNumber: `+98912${++phone}`, phoneNumberVerified: true, preference: { create: { marketingConsent: false } } } });
}
async function queue(user: { id: string; phoneNumber: string | null }, topic = "wallet.credited") {
  return fixture.client.$transaction(tx => queueNotification(tx, { topic, phone: user.phoneNumber!, userId: user.id, eventKey: randomUUID() }));
}
async function deliver() {
  let calls = 0;
  const result = await processNotifications(fixture.client, () => ({ send: async () => { calls++; return { id: `offline-${calls}` }; } }));
  return { ...result, calls };
}

test("transactional messages keep working without marketing consent", async () => {
  const user = await customer(), item = await queue(user);
  assert.equal((await deliver()).calls, 1);
  assert.equal((await fixture.client.notification.findUniqueOrThrow({ where: { id: item.id } })).status, "SENT");
});

test("queued account messages do not reach an old, disabled or unverified recipient", async () => {
  const changes = [{ phoneNumber: "+989129999999" }, { disabledAt: new Date() }, { phoneNumberVerified: false }];
  const queued: string[] = [];
  for (const [index, change] of changes.entries()) {
    const user = await customer(), item = await queue(user, index === 0 ? "order.paid" : "wallet.credited");
    queued.push(item.id);
    await fixture.client.user.update({ where: { id: user.id }, data: change });
  }
  assert.equal((await deliver()).calls, 0);
  const rows = await fixture.client.notification.findMany({ where: { id: { in: queued } } });
  assert.ok(rows.every(row => row.status === "DISABLED" && row.attempts === 0));
});

test("queued staff messages stop after the private order recipient is changed", async () => {
  const item = await fixture.client.$transaction(tx => queueNotification(tx, { topic: "staff.neworder", phone: staffPhone, eventKey: randomUUID() }));
  await fixture.client.storeRecord.update({ where: { kind_slug: { kind: "settings", slug: "shop" } }, data: { data: { orderPhone: "+989128888888" } } });
  assert.equal((await deliver()).calls, 0);
  assert.equal((await fixture.client.notification.findUniqueOrThrow({ where: { id: item.id } })).status, "DISABLED");
});

test("staff messages use only an active recipient configuration", async () => {
  const phone = "+989128888888";
  const valid = await fixture.client.$transaction(tx => queueNotification(tx, { topic: "staff.neworder", phone, eventKey: randomUUID() }));
  assert.equal((await deliver()).calls, 1);
  assert.equal((await fixture.client.notification.findUniqueOrThrow({ where: { id: valid.id } })).status, "SENT");
  const archived = await fixture.client.$transaction(tx => queueNotification(tx, { topic: "staff.neworder", phone, eventKey: randomUUID() }));
  await fixture.client.storeRecord.update({ where: { kind_slug: { kind: "settings", slug: "shop" } }, data: { status: "ARCHIVED" } });
  assert.equal((await deliver()).calls, 0);
  assert.equal((await fixture.client.notification.findUniqueOrThrow({ where: { id: archived.id } })).status, "DISABLED");
});
