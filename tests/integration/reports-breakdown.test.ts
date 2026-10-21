import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTestDatabase} from '../helpers/database';
import {seedFoundation} from '../../prisma/seed-data';
import {salesReport} from '../../src/modules/operations/reports';

let fixture:Awaited<ReturnType<typeof createTestDatabase>>,owner:string;
before(async()=>{
 fixture=await createTestDatabase();
 const db=fixture.client,ids=await seedFoundation(db);
 const role=await db.role.findUniqueOrThrow({where:{key:'owner'}});
 owner=(await db.user.create({data:{name:'گزارش‌گیر آزمایشی',roles:{create:{roleId:role.id}}}})).id;
 const customer=await db.user.create({data:{name:'خریدار آزمایشی'}});
 const makeOrder=async(paid:boolean,confirmedAt=new Date())=>db.order.create({data:{
  userId:customer.id,checkoutKey:randomUUID(),checkoutHash:'test',status:paid?'CONFIRMED':'AWAITING_PAYMENT',
  expiresAt:new Date(Date.now()+3600000),confirmedAt:paid?confirmedAt:null,
  subtotalRial:2000000n,discountRial:300000n,shippingRial:600000n,totalRial:2300000n,
  items:{create:{variantId:ids.variantId,productName:'عسل',variantName:'۹۰۰ گرم',sku:'REPORT-TEST',attributesSnapshot:{},quantity:2,unitPriceRial:1000000n,totalRial:2000000n}},
  payments:{create:Array.from({length:paid?2:1},()=>({provider:'test',idempotencyKey:randomUUID(),status:paid?'SUCCEEDED':'FAILED',amountRial:2300000n}))},
 }});
 await makeOrder(true);
 await makeOrder(false);
 await makeOrder(true,new Date(Date.now()-45*86400000));
});
after(async()=>fixture?.close());

test('paid financial breakdown stays exact, excludes unpaid and older orders, and avoids payment join duplication',async()=>{
 const report=await salesReport(fixture.client,owner);
 assert.equal(String(report.totalSubtotal),'2000000');
 assert.equal(String(report.totalDiscount),'300000');
 assert.equal(String(report.totalShipping),'600000');
 assert.equal(String(report.totalRevenue),'2300000');
 assert.equal(String(report.totalOrders),'1');
 assert.equal(String(report.totalUnits),'2');
 const day=report.daily.find(row=>BigInt(row.orders)>0n)!;
 assert.equal(BigInt(day.subtotal)-BigInt(day.discount)+BigInt(day.shipping),BigInt(day.revenue));
 assert.equal(day.orders,1n.toString());
 for(const year of report.yearly){
  assert.equal(BigInt(year.subtotal)-BigInt(year.discount)+BigInt(year.shipping),BigInt(year.revenue));
 }
 assert.equal(report.yearly.reduce((sum,row)=>sum+BigInt(row.orders),0n),2n);
});
