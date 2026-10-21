import {saveCart} from "../src/modules/operations/engagement";
import { reconcilePaymentBatch } from "../src/modules/payments/reconciliation";
import { reserveStock, releaseOrderStock, consumeOrderStock } from "../src/modules/inventory/reservations";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedFoundation } from "../prisma/seed-data";
import { submitCheckout, verifyCheckout } from "../src/modules/checkout/submit";
import type { PaymentProvider } from "../src/modules/payments/provider";
async function main() {
 const url = new URL(process.env.DATABASE_URL!); url.search = ""; const admin = new Pool({ connectionString: url.href, max: 1 });
 const name = "honey_qa_"+randomUUID().replaceAll("-", ""); await admin.query(`CREATE DATABASE "${name}"`); url.pathname = `/${name}`;
 const sql = new Pool({ connectionString: url.href, max: 1 }); const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href, max: 5 }) });
 try {
  for (const dir of (await readdir("prisma/migrations", { withFileTypes: true })).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) await sql.query(await readFile(`prisma/migrations/${dir.name}/migration.sql`,"utf8"));
  const ids = await seedFoundation(db);
  await db.product.update({ where: { id: ids.productId }, data: { status: "ACTIVE", media: { create: { objectKey: "test.webp", alt: "test" } } } });
  await db.productVariant.update({ where: { id: ids.variantId }, data: { isActive: true, priceRial: 1000000n } });
  await db.stock.update({ where: { variantId: ids.variantId }, data: { onHand: 1 } });
  const users = await Promise.all([1,2].map(n=>db.user.create({ data:{name:`Concurrent test ${n}`,phoneNumberVerified:true} })));
  const provider:PaymentProvider = { redirect(authority) { return `https://payment.zarinpal.com/pg/StartPay/${authority}`; }, async createPayment(){const authority="A"+randomUUID().replaceAll("-", "");return{authority,redirectUrl:`https://payment.zarinpal.com/pg/StartPay/${authority}`};},async verifyPayment(i){return{status:"verified",transactionId:"concurrent-test",amountRial:i.expectedAmountRial};} };
  const outcomes = await Promise.allSettled(users.map(u=>submitCheckout(db,u.id,{key:randomUUID(),lines:[{variantId:ids.variantId,quantity:1}],address:{recipientName:"Test user",phoneNumber:"09121234567",province:"Test",city:"Test",addressLine:"Test address only",postalCode:"1234567890"},expectedTotalRial:"1600000"},provider,{shippingRial:600000n,callbackUrl:"https://example.test/callback"})));
  assert.equal(outcomes.filter(o=>o.status==="fulfilled").length,1);
  const failure=outcomes.find(o=>o.status==="rejected"); assert.ok(failure?.status==="rejected" && failure.reason.code==="INSUFFICIENT_STOCK");
  const payment=await db.paymentAttempt.findFirstOrThrow();
  await Promise.all([verifyCheckout(db,payment.authority!,provider),verifyCheckout(db,payment.authority!,provider)]);
  const stock=await db.stock.findUniqueOrThrow({where:{variantId:ids.variantId}});assert.equal(stock.onHand,0);assert.equal(stock.reserved,0);assert.equal(await db.stockMovement.count({where:{type:"SALE"}}),1);
  // Fresh idempotency keys for one customer cannot create competing stock holds.
  await db.stock.update({ where: { variantId: ids.variantId }, data: { onHand: 5, reserved: 0 } });
  const buyer = await db.user.create({ data: { name: "Concurrent recovery buyer", phoneNumberVerified: true } });
  const inputs = [1,2].map(() => ({ key: randomUUID(), lines: [{ variantId: ids.variantId, quantity: 1 }], address: { recipientName: "Test user", phoneNumber: "09121234567", province: "Test", city: "Test", addressLine: "Test recovery address", postalCode: "1234567890" }, expectedTotalRial: "1600000" }));
  let creates = 0;
  const countedProvider: PaymentProvider = { ...provider, async createPayment(input) { creates++; return provider.createPayment(input); } };
  const config = { shippingRial: 600000n, callbackUrl: "https://example.test/callback" };
  const fresh = await Promise.allSettled(inputs.map(input => submitCheckout(db, buyer.id, input, countedProvider, config)));
  assert.equal(fresh.filter(result => result.status === "fulfilled").length, 1);
  const blocked = fresh.find(result => result.status === "rejected");
  assert.ok(blocked?.status === "rejected" && blocked.reason.code === "ACTIVE_CHECKOUT_EXISTS");
  const winnerIndex = fresh.findIndex(result => result.status === "fulfilled");
  const replay = await submitCheckout(db, buyer.id, inputs[winnerIndex], countedProvider, config);
  assert.deepEqual(replay, (fresh[winnerIndex] as PromiseFulfilledResult<typeof replay>).value);
  assert.equal(creates, 1);
  assert.equal(await db.order.count({ where: { userId: buyer.id } }), 1);
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).reserved, 1);
  // The module serializes terminal effects even without caller-provided snapshots.
  const winningOrder = replay.orderId;
  const releases = await Promise.all([db.$transaction(tx => releaseOrderStock(tx, winningOrder)), db.$transaction(tx => releaseOrderStock(tx, winningOrder))]);
  assert.deepEqual([...releases].sort(), [0, 1]);
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).reserved, 0);
  const raceOrder = await db.$transaction(async tx => {
   const expiresAt = new Date(Date.now()+600000);
   const reservations = await reserveStock(tx, [{ variantId: ids.variantId, quantity: 1 }], expiresAt);
   return tx.order.create({ data: { userId: buyer.id, checkoutKey: randomUUID(), checkoutHash: "inventory-terminal-race", subtotalRial: 1000000n, totalRial: 1000000n, expiresAt, items: { create: { variantId: ids.variantId, sku: "DRBIZ-HONEY-900", productName: "Fixture", variantName: "Jar", attributesSnapshot: {}, quantity: 1, unitPriceRial: 1000000n, totalRial: 1000000n } }, reservations: { create: reservations }, payments: { create: { provider: "test", idempotencyKey: randomUUID(), amountRial: 1000000n, status: "PENDING" } } }, include: { payments: true } });
  });
  const terminal = await Promise.allSettled([db.$transaction(tx => consumeOrderStock(tx, raceOrder.id, raceOrder.payments[0].id)), db.$transaction(tx => releaseOrderStock(tx, raceOrder.id))]);
  assert.equal(terminal.filter(result => result.status === "fulfilled").length, 1);
  const conflict = terminal.find(result => result.status === "rejected");
  assert.ok(conflict?.status === "rejected" && conflict.reason.code === "STOCK_CONFLICT");
  const reservation = await db.stockReservation.findFirstOrThrow({ where: { orderId: raceOrder.id } });
  const finalStock = await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } });
  assert.equal(finalStock.reserved, 0);
  assert.equal(finalStock.onHand, reservation.status === "CONSUMED" ? 4 : 5);
  assert.equal(await db.stockMovement.count({ where: { orderId: raceOrder.id, type: "SALE" } }), reservation.status === "CONSUMED" ? 1 : 0);
  // Multiple Worker replicas compete for the same due PaymentAttempt.
  const reconciliationTime = new Date();
  const reconciliationProvider = `reconcile-${randomUUID()}`;
  const reconciliationOrder = await db.$transaction(async tx => {
   const expiresAt = new Date(reconciliationTime.getTime() - 3600000);
   const reservations = await reserveStock(tx, [{ variantId: ids.variantId, quantity: 1 }], expiresAt);
   return tx.order.create({ data: { userId: buyer.id, checkoutKey: randomUUID(), checkoutHash: "reconciliation-race", subtotalRial: 1000000n, totalRial: 1000000n, expiresAt, items: { create: { variantId: ids.variantId, sku: "DRBIZ-HONEY-900", productName: "Fixture", variantName: "Jar", attributesSnapshot: {}, quantity: 1, unitPriceRial: 1000000n, totalRial: 1000000n } }, reservations: { create: reservations }, payments: { create: { provider: reconciliationProvider, authority: "A"+randomUUID().replaceAll("-", ""), idempotencyKey: randomUUID(), amountRial: 1000000n, status: "PENDING", updatedAt: expiresAt } } } });
  });
  let verificationCalls = 0;
  const reconciliationAdapter: PaymentProvider = { ...provider, async verifyPayment(input) { verificationCalls++; return { status: "verified", transactionId: "reconciliation-race", amountRial: input.expectedAmountRial }; } };
  const batches = await Promise.all([1, 2, 3].map(() => reconcilePaymentBatch(db, reconciliationAdapter, reconciliationProvider, reconciliationTime)));
  assert.equal(batches.reduce((sum, batch) => sum + batch.checked, 0), 1);
  assert.equal(batches.reduce((sum, batch) => sum + batch.verified, 0), 1);
  assert.equal(batches.reduce((sum, batch) => sum + batch.errors, 0), 0);
  assert.equal(verificationCalls, 1);
  assert.equal(await db.stockMovement.count({ where: { orderId: reconciliationOrder.id, type: "SALE" } }), 1);
  assert.equal((await db.stock.findUniqueOrThrow({ where: { variantId: ids.variantId } })).reserved, 0);
  const cartKey=randomUUID();
  const cartInput={lines:[{variantId:ids.variantId,quantity:2}],mutationKey:cartKey,expectedActivityVersion:null,expectedOwner:buyer.id};
  const writes=await Promise.all([1,2,3].map(()=>saveCart(db,buyer.id,cartInput)));
  assert.ok(writes.every(w=>w.activityVersion===writes[0].activityVersion));
  assert.equal(await db.cartWriteReceipt.count({where:{userId:buyer.id,key:cartKey}}),1);
  await saveCart(db,buyer.id,{lines:[{variantId:ids.variantId,quantity:4}],expectedActivityVersion:writes[0].activityVersion});
  await saveCart(db,buyer.id,cartInput);
  assert.equal((await db.cartItem.findFirstOrThrow({where:{cart:{userId:buyer.id}}})).quantity,4);
  console.info("PostgreSQL last-unit/callback races, same-customer quota/replay, concurrent release and consume-vs-release Worker reconciliation and cart-write replay races passed.");
 } finally { await db.$disconnect(); await sql.end(); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); await admin.end(); }
}
main().catch(()=>{console.error("PostgreSQL concurrency check failed.");process.exitCode=1;});
