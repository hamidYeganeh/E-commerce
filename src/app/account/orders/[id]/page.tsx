import {ReorderButton} from "@/components/commerce/reorder-button";
import {Visit} from "@/components/operations/visit";
import { ReturnsPanel } from "@/components/orders/returns-panel";
import {publicSettings} from "@/modules/operations/records";
import {PublicForm} from "@/components/operations/public-forms";
import {availableGateways,resolveGateway} from "@/modules/payments/gateways";
import { OrderPaymentActions } from "@/components/orders/order-payment-actions";
import { canContinuePayment } from "@/modules/checkout/continuation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/modules/identity/request";
import { getDatabase } from "@/infrastructure/database/server";
import { StoreShell } from "@/components/storefront/store-shell";
import { orderStatusNames, shipmentStatusNames } from "@/components/orders/labels";
import { priceToman } from "@/components/catalog/format";
import { Badge } from "@/components/ui/badge";
export const metadata = { title: "جزئیات سفارش من", robots: { index: false, follow: false } };
export default function Page({ params }: { params: Promise<{ id: string }> }) { return <StoreShell current="account"><Suspense fallback={<p className="page-loading">در حال دریافت سفارش…</p>}><Order params={params} /></Suspense></StoreShell>; }
async function Order({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePageIdentity();
  const order = await getDatabase().order.findFirst({ where: { id: (await params).id, userId: identity.user.id }, include: { items: true, address: true, shipments: {include:{items:{include:{orderItem:{select:{productName:true,variantName:true}}}}}}, reservations: true, payments: true } });
  if (!order) notFound();
  const payment=order.payments[0],providerName=payment?.provider??"zarinpal";
  let configured=false;try{await resolveGateway(getDatabase(),providerName,true);configured=true;}catch{}
  const enabled=(await availableGateways(getDatabase())).some(g=>g.id===providerName);
  const continuation = canContinuePayment(order, order.payments.find(p => p.provider === providerName), providerName);
  const questions=(await publicSettings(getDatabase()))?.ratingQuestions.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,20)??[];
  const paid = order.payments.some(p => p.status === "SUCCEEDED");
  return <div className="commerce-page"><nav className="breadcrumbs"><Link href="/account/orders">سفارش‌های من</Link><span>/</span><span>#{order.number.toLocaleString("fa-IR")}</span></nav><header className="commerce-heading"><div><p className="eyebrow">{order.createdAt.toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" })}</p><h1>سفارش #{order.number.toLocaleString("fa-IR")}</h1><p>{paid ? "سفارش شما تسویه و تأیید شده است." : "پرداخت هنوز تأیید نشده است؛ پیش از پرداخت مجدد نتیجه را بررسی کنید."}</p></div><Badge>{orderStatusNames[order.status]}</Badge></header>{order.status === "AWAITING_PAYMENT" && !paid && <OrderPaymentActions orderId={order.id} configured={configured} canContinue={enabled && continuation} />}<div className="order-detail-layout"><Card className="panel"><CardHeader><CardTitle>اقلام سفارش</CardTitle></CardHeader><CardContent>{order.items.map(i => <div className="customer-order-line" key={i.id}><div><h3>{i.productName}</h3><p>{i.variantName} · {i.quantity.toLocaleString("fa-IR")} عدد</p></div><strong>{priceToman(i.totalRial.toString())} تومان</strong></div>)}<dl className="order-totals"><div><dt>ارسال</dt><dd>{priceToman(order.shippingRial.toString())} تومان</dd></div><div><dt>مبلغ نهایی</dt><dd>{priceToman(order.totalRial.toString())} تومان</dd></div></dl></CardContent></Card><aside><Card className="panel"><CardHeader><CardTitle>نشانی تحویل</CardTitle></CardHeader><CardContent>{order.address && <><strong>{order.address.recipientName}</strong><p>{order.address.province}، {order.address.city}، {order.address.addressLine}</p><p>کد پستی: <bdi>{order.address.postalCode}</bdi></p></>}</CardContent></Card><Card className="panel"><CardHeader><CardTitle>وضعیت ارسال</CardTitle></CardHeader><CardContent>{order.shipments.length ? order.shipments.map(s => <div key={s.id}><Badge variant="secondary">{shipmentStatusNames[s.status]}</Badge><p>{s.carrier} · <bdi>{s.trackingNumber}</bdi></p><ul>{s.items.map(i=><li key={i.orderItemId}>{i.orderItem.productName} / {i.orderItem.variantName} × {i.quantity}</li>)}</ul></div>) : <p>هنوز مرسوله‌ای ثبت نشده است.</p>}</CardContent></Card></aside></div>{paid&&<Visit kind="purchase" targetId="store"/>}<ReorderButton orderId={order.id}/>{order.giftMessage&&<p>پیام هدیه: {order.giftMessage}</p>}<ReturnsPanel orderId={order.id}/>{order.status==="COMPLETED"&&<div className="mt-8"><PublicForm kind="comment" targetType="order" targetId={order.id} questions={questions}/></div>}</div>;
}
