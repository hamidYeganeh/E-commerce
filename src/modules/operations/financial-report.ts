import {Prisma,type PrismaClient} from "../../generated/prisma/client";
import {requirePermission} from "../identity/authorization";
import {jsonSafe} from "../../shared/json";
import {reportDates,persianYear,persianYearStart} from "./report-period";
async function period(tx:Prisma.TransactionClient,from:string,to:string){
 const [bounds]=await tx.$queryRaw<{start:Date;end:Date}[]>`SELECT (${from}::date::timestamp AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'UTC' AS start,((${to}::date+1)::timestamp AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'UTC' AS end`;
 const orders=await tx.order.findMany({where:{confirmedAt:{gte:bounds.start,lt:bounds.end},payments:{some:{status:"SUCCEEDED"}}},select:{subtotalRial:true,discountRial:true,shippingRial:true,totalRial:true,items:{select:{quantity:true,unitCostRial:true}}}});
 const refunds=(await tx.refund.aggregate({where:{status:"SUCCEEDED",OR:[{completedAt:{gte:bounds.start,lt:bounds.end}},{completedAt:null,updatedAt:{gte:bounds.start,lt:bounds.end}}]},_sum:{amountRial:true}}))._sum.amountRial??0n;
 const returns=await tx.stockMovement.findMany({where:{type:"RETURN",createdAt:{gte:bounds.start,lt:bounds.end}},select:{quantity:true,unitCostRial:true}});
 const subtotal=orders.reduce((s,o)=>s+o.subtotalRial,0n),discount=orders.reduce((s,o)=>s+o.discountRial,0n),shipping=orders.reduce((s,o)=>s+o.shippingRial,0n),revenue=orders.reduce((s,o)=>s+o.totalRial,0n),items=orders.flatMap(o=>o.items),unknownCost=items.filter(i=>i.unitCostRial===null).length+returns.filter(r=>r.unitCostRial===null).length;
 const cost=items.reduce((s,i)=>s+(i.unitCostRial??0n)*BigInt(i.quantity),0n),recoveredCost=returns.reduce((s,r)=>s+(r.unitCostRial??0n)*BigInt(r.quantity),0n);
 return{from,to,orders:orders.length,units:items.reduce((s,i)=>s+i.quantity,0),subtotal,discount,shipping,revenue,refunds,netRevenue:revenue-refunds,cost:unknownCost?null:cost,recoveredCost:unknownCost?null:recoveredCost,margin:unknownCost?null:revenue-refunds-cost+recoveredCost,unknownCost};
}
export async function financialReport(db:PrismaClient,actorId:string,input:unknown={}){
 await requirePermission(db,actorId,"reports.read");const dates=reportDates(input);
 return db.$transaction(async tx=>{
  const current=await period(tx,dates.from,dates.to),previous=await period(tx,dates.previousFrom,dates.previousTo);
  const year=persianYear(new Date()),yearly=[];
  for(let y=year;y>year-5;y--)yearly.push({year:y,...await period(tx,persianYearStart(y),new Date(Date.parse(persianYearStart(y+1))-86400000).toISOString().slice(0,10))});
  const daily=await tx.$queryRaw<{day:string;revenue:bigint;orders:bigint}[]>`WITH days AS (SELECT generate_series((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tehran')::date-55,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tehran')::date,'1 day')::date AS day) SELECT d.day::text,COALESCE(sum(o."totalRial"),0)::bigint revenue,count(o.id)::bigint orders FROM days d LEFT JOIN "Order" o ON (o."confirmedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')::date=d.day AND EXISTS(SELECT 1 FROM "PaymentAttempt" p WHERE p."orderId"=o.id AND p.status='SUCCEEDED') GROUP BY d.day ORDER BY d.day`;
  const totalOrders=daily.reduce((s,d)=>s+Number(d.orders),0),forecast=totalOrders>=14?{method:"میانگین وزن‌دار روز مشابه هفته در ۸ هفته؛ بدون تضمین فروش",revenue:daily.reduce((s,d,i)=>s+d.revenue*BigInt(Math.floor(i/7)+1),0n)/36n,observations:totalOrders}:null;
  const funnel=await tx.visitEvent.groupBy({by:["kind"],where:{day:{gte:dates.from,lte:dates.to},kind:{in:["product","cart","login","checkout","payment","purchase"]}},_count:true});
  return jsonSafe({dates,current,previous,yearly,forecast,funnel:funnel.map(f=>({stage:f.kind,visitorDays:f._count})),changePercent:previous.netRevenue===0n?null:Number((current.netRevenue-previous.netRevenue)*10000n/previous.netRevenue)/100});
 },{isolationLevel:"RepeatableRead",timeout:30000});
}
