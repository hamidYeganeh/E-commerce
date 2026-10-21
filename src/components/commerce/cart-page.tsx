"use client";
import {Visit} from "@/components/operations/visit";
import {SavedAddresses} from "@/components/commerce/saved-addresses";
import { EditorialBanner } from "@/components/storefront/editorial-banner";
import { MotionNumber, SuccessCheck } from "./motion-number";
import { Skeleton } from "@/components/ui/skeleton";
import { paymentDestination } from "@/modules/payments/destination";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpLeftIcon, ShoppingBagIcon, MinusIcon, PlusIcon, Trash2Icon, InfoIcon, MapPinIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { priceToman } from "@/components/catalog/format";
import { addressSchema, type DeliveryAddress } from "@/modules/checkout/contracts";
import type { CartQuote } from "@/modules/checkout/quote";
import { cartOwner, rememberCartCheckout, updateCartLine, useCart } from "./cart-store";

const fields = ["recipientName", "phoneNumber", "province", "city", "addressLine", "postalCode"] as const;
export function CartPage({ checkout = false }: { checkout?: boolean }) {
  const design = useTranslations("ShopDesign");
  const router = useRouter(); const t = useTranslations("Commerce"); const { lines, hydrated } = useCart();
  const [giftMessage,setGiftMessage]=useState("");
  const [gatewayId,setGatewayId]=useState("");
  const [shippingMethodId,setShippingMethodId]=useState(""); const [couponDraft,setCouponDraft]=useState(""); const [couponCode,setCouponCode]=useState("");
  const key = JSON.stringify(lines); const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: CartQuote; error?: string } | null>(null);
  const [storageError, setStorageError] = useState(""); const [address, setAddress] = useState<DeliveryAddress | null>(null);
  const [addressDraft, setAddressDraft] = useState<DeliveryAddress | null>(null);
  const quoteKey=JSON.stringify({lines,address,shippingMethodId,couponCode});
  const checkoutKey = useRef<string | null>(null);
  const [paying, setPaying] = useState(false); const [paymentError, setPaymentError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!hydrated || !lines.length) return;
    const controller = new AbortController();
    fetch("/api/checkout/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: address ? JSON.stringify({lines,address,shippingMethodId:shippingMethodId||undefined,couponCode:couponCode||undefined}) : key, signal: controller.signal, cache: "no-store" }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.message ?? t("quoteError")); return data as CartQuote; }).then(data => setResult({ key:quoteKey, data })).catch(error => { if (!controller.signal.aborted) setResult({ key:quoteKey, error: error instanceof Error ? error.message : t("quoteError") }); });
    return () => controller.abort();
  }, [key, quoteKey, hydrated, refresh, lines.length, t, address, couponCode, shippingMethodId, lines]);
  const data = result?.key === quoteKey ? result.data : undefined;
  const error = result?.key === quoteKey ? result.error : undefined;
  function change(id: string, quantity: number) { try { updateCartLine(id, quantity); setStorageError(""); } catch { setStorageError(t("saveError")); } }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const input = Object.fromEntries(fields.map(f => [f, String(form.get(f) ?? "")])); const parsed = addressSchema.safeParse(input);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0]), t(`addressErrors.${String(i.path[0])}` as "addressErrors.city")]))); return; }
    setErrors({}); setShippingMethodId(""); setAddressDraft(parsed.data); setAddress(parsed.data);
  }
  async function pay() {
    if (!address || !data?.valid || !data.totalRial) return;
    setPaying(true); setPaymentError("");
    try {
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ owner: cartOwner(), key, address, total: data.totalRial,shippingMethodId:data.shippingMethodId,couponCode,gatewayId,giftMessage })));
      const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
      const saved = sessionStorage.getItem("honey-checkout-attempt");
      const previous = saved ? JSON.parse(saved) as { fingerprint: string; id: string } : null;
      checkoutKey.current = previous?.fingerprint === fingerprint ? previous.id : crypto.randomUUID();
      sessionStorage.setItem("honey-checkout-attempt", JSON.stringify({ fingerprint, id: checkoutKey.current }));
      rememberCartCheckout(checkoutKey.current, lines);
      const response = await fetch("/api/checkout/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: checkoutKey.current, lines, address, giftMessage, expectedTotalRial: data.totalRial,shippingMethodId:data.shippingMethodId,couponCode:couponCode||undefined,gatewayId:gatewayId||undefined }) });
      const result = await response.json();
      if (response.status === 401) { router.push("/login?next=/checkout"); return; }
      if (!response.ok) throw new Error(result.message ?? t("paymentError"));
      // Keep the cart and attempt key until the customer knows the result.
      // A lost response or cancelled navigation must not erase their selection.
      if(result.settled){router.push(`/account/orders/${result.orderId}`);return;}
      location.assign(paymentDestination(result.redirectUrl));
    } catch (e) { setPaymentError(e instanceof Error ? e.message : t("paymentError")); setPaying(false); }
  }
  return <div className="commerce-page"><Visit kind={checkout?"checkout":"cart"} targetId="store"/><nav className="breadcrumbs" aria-label={t("breadcrumb")}><Link href="/">{t("home")}</Link><span>/</span><Link href="/products">{t("products")}</Link><span>/</span><span>{checkout ? t("checkout") : t("cart")}</span></nav><EditorialBanner compact label={t("smallMoments")} title={checkout ? t("checkoutTitle") : t("cartTitle")} description={checkout ? t("checkoutDescription") : t("cartDescription")} /><ol className="commerce-steps" aria-label={design("stepsLabel")}><li aria-current={!checkout ? "step" : undefined}><span>۱</span>{design("cartStep")}</li><li aria-current={checkout ? "step" : undefined}><span>۲</span>{design("addressStep")}</li><li><span>۳</span>{design("paymentStep")}</li></ol><header className="commerce-heading"><Link className="text-link" href={checkout ? "/cart" : "/products"}>{checkout ? t("editCart") : t("continueShopping")} <ArrowUpLeftIcon aria-hidden="true" /></Link></header>
    {!hydrated ? <div role="status" aria-label={t("loading")}><Skeleton className="h-40 w-full" /></div> : !lines.length ? <Empty className="commerce-empty"><EmptyHeader><Image className="commerce-empty-image" src="/images/vitaboost/dr-biz-honey.png" alt="" width={100} height={120} /><EmptyMedia variant="icon"><ShoppingBagIcon /></EmptyMedia><EmptyTitle>{t("emptyTitle")}</EmptyTitle><EmptyDescription>{t("emptyDescription")}</EmptyDescription></EmptyHeader><EmptyContent><Button size="lg" asChild><Link href="/products">{t("explore")}<ArrowUpLeftIcon data-icon="inline-end" /></Link></Button></EmptyContent></Empty> : <div className="commerce-layout"><section className="commerce-lines">
      {storageError && <p role="alert" className="form-error">{storageError}</p>}
      {error && <Alert variant="destructive"><InfoIcon /><AlertTitle>{t("quoteError")}</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => { setResult(null); setRefresh(v => v + 1); }}>{t("retry")}</Button></AlertDescription></Alert>}
      {!data && !error && <p role="status">{t("checking")}</p>}
      {lines.map(line => { const item = data?.items.find(i => i.variantId === line.variantId); return <article className="commerce-line" key={line.variantId}><div className="commerce-line-image">{item?.product?.image ? <Image src={item.product.image.url} alt={item.product.image.alt} fill unoptimized sizes="120px" /> : <ShoppingBagIcon aria-hidden="true" />}</div><div className="commerce-line-content">{item?.product ? <Link href={`/products/${item.product.slug}`}><h2>{item.product.name}</h2></Link> : <h2>{t("cartItem")}</h2>}<p>{item?.variant?.name ?? t("checkingProduct")}</p>{item?.reason && <p role="status" className="form-error">{item.reason}</p>}<div className="commerce-line-actions"><div className="commerce-quantity"><Button variant="ghost" size="icon" aria-label={t("minus")} disabled={line.quantity <= 1} onClick={() => change(line.variantId, line.quantity - 1)}><MinusIcon /></Button><output><MotionNumber value={line.quantity.toLocaleString("fa-IR")} /></output><Button variant="ghost" size="icon" aria-label={t("plus")} disabled={line.quantity >= 20} onClick={() => change(line.variantId, line.quantity + 1)}><PlusIcon /></Button></div><Button variant="ghost" size="icon" aria-label={t("removeItem", { name: item?.product?.name ?? t("cartItem") })} onClick={() => change(line.variantId, 0)}><Trash2Icon /></Button></div></div><strong className="commerce-line-price">{item?.variant ? <>{priceToman(item.lineTotalRial)} <small>{t("toman")}</small></> : "—"}</strong></article>; })}
      {checkout && <Card className="commerce-address"><CardHeader><CardTitle>{address ? t("reviewAddress") : t("deliveryAddress")}</CardTitle></CardHeader><CardContent><SavedAddresses onSelect={value=>{setAddressDraft(value);setAddress(value);}}/>{address ? <div className="commerce-address-review"><SuccessCheck /><h2>{address.recipientName}</h2><p>{address.province}، {address.city}، {address.addressLine}</p><p dir="ltr">{address.phoneNumber} · {address.postalCode}</p><Button variant="outline" onClick={() => setAddress(null)}>{t("editAddress")}</Button></div> : <form onSubmit={review} noValidate><FieldGroup className="commerce-address-fields">{fields.map(f => <Field key={f} data-invalid={!!errors[f]}><FieldLabel htmlFor={f}>{t(`address.${f}`)}</FieldLabel><Input id={f} name={f} defaultValue={addressDraft?.[f] ?? ""} autoComplete={({ recipientName: "shipping name", phoneNumber: "shipping tel", province: "shipping address-level1", city: "shipping address-level2", addressLine: "shipping street-address", postalCode: "shipping postal-code" })[f]} maxLength={f === "addressLine" ? 500 : 100} inputMode={f === "phoneNumber" ? "tel" : f === "postalCode" ? "numeric" : "text"} aria-invalid={!!errors[f]} aria-describedby={errors[f] ? `${f}-error` : undefined} />{errors[f] && <FieldError id={`${f}-error`}>{errors[f]}</FieldError>}</Field>)}</FieldGroup><Button className="commerce-review-button" type="submit"><MapPinIcon data-icon="inline-start" />{t("review")}</Button></form>}</CardContent></Card>}
      {checkout && address && <Card><CardHeader><CardTitle>ارسال و کد تخفیف</CardTitle></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="gift-message">پیام هدیه (اختیاری)</FieldLabel><Input id="gift-message" maxLength={500} value={giftMessage} onChange={e=>setGiftMessage(e.target.value)}/></Field>{!!data?.shippingMethods.length && <Field><FieldLabel>روش ارسال</FieldLabel>{data.shippingMethods.length<=7?<ToggleGroup aria-label="روش ارسال" type="single" value={data.shippingMethodId??""} onValueChange={value=>{if(value)setShippingMethodId(value);}} className="flex flex-col items-stretch">{data.shippingMethods.map(m=><ToggleGroupItem key={m.id} value={m.id}>{m.name} · {priceToman(m.feeRial)} تومان</ToggleGroupItem>)}</ToggleGroup>:<NativeSelect aria-label="روش ارسال" value={data.shippingMethodId??""} onChange={e=>setShippingMethodId(e.target.value)}>{data.shippingMethods.map(m=><NativeSelectOption key={m.id} value={m.id}>{m.name} · {priceToman(m.feeRial)} تومان</NativeSelectOption>)}</NativeSelect>}</Field>}<Field><FieldLabel htmlFor="coupon-code">کد تخفیف</FieldLabel><Input id="coupon-code" dir="ltr" maxLength={40} value={couponDraft} onChange={e=>setCouponDraft(e.target.value)} /></Field><Button variant="outline" onClick={()=>setCouponCode(couponDraft.trim())}>بررسی کد تخفیف</Button>{data?.discountRial!=="0"&&data?.discountRial&&<p>تخفیف: {priceToman(data.discountRial)} تومان</p>}{!!data?.gateways.length&&<Field><FieldLabel>درگاه پرداخت</FieldLabel><ToggleGroup aria-label="درگاه پرداخت" type="single" variant="outline" value={gatewayId||data.gateways[0].id} onValueChange={v=>v&&setGatewayId(v)}>{data.gateways.map(g=><ToggleGroupItem value={g.id} key={g.id}>{g.name}</ToggleGroupItem>)}</ToggleGroup></Field>}<p>{data?.message}</p></FieldGroup></CardContent></Card>}
    </section><aside className="commerce-summary"><Card><CardHeader><CardTitle>{t("summary")}</CardTitle></CardHeader><CardContent><dl><div><dt>{t("itemCount")}</dt><dd>{lines.reduce((sum, l) => sum + l.quantity, 0).toLocaleString("fa-IR")}</dd></div><div><dt>{t("subtotal")}</dt><dd>{data ? `${priceToman(data.subtotalRial)} ${t("toman")}` : "—"}</dd></div><div><dt>{t("shipping")}</dt><dd>{data?.shippingRial !== null && data?.shippingRial !== undefined ? `${priceToman(data.shippingRial)} ${t("toman")}` : t("shippingPending")}</dd></div>{data?.totalRial && <div><dt>{t("total")}</dt><dd>{priceToman(data.totalRial)} {t("toman")}</dd></div>}</dl><p className="commerce-summary-note">{t("stockNote")}</p></CardContent><CardFooter>{checkout ? <div className="commerce-payment"><Button size="lg" disabled={!data?.paymentEnabled || !data.valid || !address || paying} onClick={pay}>{paying ? t("connecting") : data?.paymentEnabled&&data.totalRial==="0"?"ثبت سفارش رایگان": data?.paymentEnabled ? t("payZarinpal") : t("paymentDisabled")}</Button><p>{data?.paymentEnabled ? (data.totalRial === "0" ? t("freeOrderNote") : t("paymentProviderNote")) : t("noOrder")}</p>{paymentError && <p role="alert" className="form-error">{paymentError} <Link href="/account/orders">{t("myOrders")}</Link></p>}<Link className="text-link" href="/login?next=/checkout">{t("loginForPurchase")}</Link></div> : <Button size="lg" disabled={!data?.valid} asChild={!!data?.valid}>{data?.valid ? <Link href="/checkout">{t("checkout")}<ArrowUpLeftIcon data-icon="inline-end" /></Link> : <span>{t("checkout")}</span>}</Button>}</CardFooter></Card>{checkout && !data?.paymentEnabled && <Alert><InfoIcon /><AlertTitle>{t("setupTitle")}</AlertTitle><AlertDescription>{t("setupBody")}</AlertDescription></Alert>}</aside></div>}
  </div>;
}
