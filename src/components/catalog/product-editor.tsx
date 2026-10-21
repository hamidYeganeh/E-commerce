"use client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";


import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import type { AttributeDefinition, AttributeValueInput, CatalogLookups, ProductInput } from "@/modules/catalog/contracts";
import { canonicalNumber, effectiveRules } from "@/modules/catalog/rules";
import { catalogRequest } from "./client";
import { rialInput, statusNames, tomanInput } from "./format";

export type StockInfo = { variantId: string; onHand: number; reserved: number; version: number };
export const blankProduct: ProductInput = { name: "", slug: "", description: "", brandId: null, status: "DRAFT", version: 0, seoTitle: "", seoDescription: "", categoryIds: [], primaryCategoryId: null, tagIds: [], attributes: [], media: [], variants: [{ name: "بستهٔ اصلی", sku: "", barcode: "", priceRial: "0", netWeightGrams: null, shippingWeightGrams: null, isActive: true, attributes: [] }] };

function AttributeFields({ definitions, values, requiredIds, disabled, onChange }: { definitions: AttributeDefinition[]; values: AttributeValueInput[]; requiredIds: string[]; disabled: boolean; onChange: (v: AttributeValueInput[]) => void }) {
  const prefix = useId();
  function set(id: string, value: string) { onChange([...values.filter((v) => v.attributeId !== id), ...(value ? [{ attributeId: id, value }] : [])]); }
  return <FieldGroup className="grid gap-5 md:grid-cols-2">{definitions.map((a) => { const value = values.find((v) => v.attributeId === a.id)?.value ?? "", id = `${prefix}-${a.id}`; return <Field key={a.id} data-disabled={disabled}>
    <FieldLabel id={`${id}-label`} htmlFor={a.type === "BOOLEAN" ? undefined : id}>{a.name}{a.unit ? ` (${a.unit})` : ""}{requiredIds.includes(a.id) ? " *" : ""}</FieldLabel>
    {a.type === "BOOLEAN" ? <ToggleGroup type="single" variant="outline" disabled={disabled} aria-labelledby={`${id}-label`} value={value || "unset"} onValueChange={(next) => next && set(a.id, next === "unset" ? "" : next)} className="flex flex-wrap"><ToggleGroupItem value="unset">انتخاب نشده</ToggleGroupItem><ToggleGroupItem value="true">بله</ToggleGroupItem><ToggleGroupItem value="false">خیر</ToggleGroupItem></ToggleGroup> : a.type === "SELECT" ? <NativeSelect id={id} disabled={disabled} value={value} onChange={(e) => set(a.id, e.target.value)}><NativeSelectOption value="">انتخاب نشده</NativeSelectOption>{a.options.map((o) => <NativeSelectOption value={o.id} key={o.id}>{o.label}</NativeSelectOption>)}</NativeSelect> : <Input id={id} disabled={disabled} value={value} maxLength={500} inputMode={a.type === "NUMBER" ? "decimal" : "text"} onChange={(e) => set(a.id, a.type === "NUMBER" ? e.target.value.replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) - (d >= "۰" ? 1776 : 1632))).replace(/٫/g, ".") : e.target.value)} />}</Field>; })}</FieldGroup>;
}
function StockAdjustment({ initial, label, canWrite }: { initial: StockInfo; label: string; canWrite: boolean }) {
  const [stock, setStock] = useState(initial);
  const [onHand, setOnHand] = useState(String(initial.onHand));
  const [reason, setReason] = useState("");
  const [eventKey, setEventKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setPending(true); setError(""); setNotice("");
    const key = eventKey ?? crypto.randomUUID(); setEventKey(key);
    try { const saved = await catalogRequest<StockInfo>(`/api/admin/inventory/${stock.variantId}`, "PUT", { onHand: Number(onHand), version: stock.version, reason, eventKey: key }); setStock(saved); setOnHand(String(saved.onHand)); setReason(""); setEventKey(null); setNotice("موجودی و سابقهٔ انبار ثبت شد."); }
    catch (err) { setError((err as Error).message); }
    finally { setPending(false); }
  }
  return <form method="post" className="catalog-form stock-adjustment" onSubmit={submit}><FieldSet disabled={pending}><FieldLegend>{label}</FieldLegend><FieldDescription>موجودی فیزیکی: {stock.onHand.toLocaleString("fa-IR")} · رزروشده: {stock.reserved.toLocaleString("fa-IR")} · قابل فروش: {(stock.onHand - stock.reserved).toLocaleString("fa-IR")}</FieldDescription>{canWrite && <><FieldGroup className="grid gap-5 md:grid-cols-2"><Field data-disabled={pending}><FieldLabel htmlFor={`stock-${stock.variantId}`}>موجودی فیزیکی جدید</FieldLabel><Input id={`stock-${stock.variantId}`} required type="number" min={stock.reserved} max={10000000} step={1} value={onHand} onChange={(e) => { setOnHand(e.target.value); setEventKey(null); }} /></Field><Field data-disabled={pending}><FieldLabel htmlFor={`stock-reason-${stock.variantId}`}>دلیل تغییر</FieldLabel><Input id={`stock-reason-${stock.variantId}`} required minLength={3} maxLength={500} placeholder="مثلاً دریافت از تأمین‌کننده" value={reason} onChange={(e) => { setReason(e.target.value); setEventKey(null); }} /></Field></FieldGroup><Button type="submit" variant="outline" className="self-start" disabled={pending}>{pending ? "در حال ثبت…" : "ثبت تغییر موجودی"}</Button></>}</FieldSet>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{notice && <Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert>}</form>;
}

export function ProductEditor({ id, initial = blankProduct, lookups, initialStocks = [], canWrite, canInventory }: { id: string | null; initial?: ProductInput; lookups: CatalogLookups; initialStocks?: StockInfo[]; canWrite: boolean; canInventory: boolean }) {
  const router = useRouter();
  const [product, setProduct] = useState(initial);
  const [stocks, setStocks] = useState(initialStocks);
  const [pending, setPending] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  let rules: ReturnType<typeof effectiveRules> = [];
  let ruleError = "";
  try { rules = effectiveRules(product.categoryIds, lookups.categories, lookups.categories.flatMap((c) => c.attributes)); } catch (err) { ruleError = (err as Error).message; }
  const definitions = (variant: boolean) => lookups.attributes.filter((a) => rules.some((r) => r.attributeId === a.id && r.isVariant === variant));
  const requiredIds = rules.filter((r) => r.isRequired).map((r) => r.attributeId);
  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => setProduct((p) => ({ ...p, [key]: value }));
  function variant(index: number, values: Partial<ProductInput["variants"][number]>) { setProduct((p) => ({ ...p, variants: p.variants.map((v, i) => i === index ? { ...v, ...values } : v) })); }
  function categories(ids: string[]) {
    // Removed category assignments must not leave hidden, invalid attribute values.
    try {
      const nextRules = effectiveRules(ids, lookups.categories, lookups.categories.flatMap((c) => c.attributes));
      setProduct((p) => ({ ...p, categoryIds: ids, primaryCategoryId: ids.includes(p.primaryCategoryId ?? "") ? p.primaryCategoryId : ids[0] ?? null, attributes: p.attributes.filter((a) => nextRules.some((r) => r.attributeId === a.attributeId && !r.isVariant)), variants: p.variants.map((v) => ({ ...v, attributes: v.attributes.filter((a) => nextRules.some((r) => r.attributeId === a.attributeId && r.isVariant)) })) }));
    } catch (err) { setError((err as Error).message); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(""); setNotice("");
    try {
      const saved = await catalogRequest<{ id: string }>(`/api/admin/catalog/products${id ? `/${id}` : ""}`, id ? "PUT" : "POST", product);
      if (!id) { router.replace(`/admin/catalog/products/${saved.id}`); router.refresh(); }
      else { const updated = await catalogRequest<ProductInput & { stocks: StockInfo[] }>(`/api/admin/catalog/products/${id}`); setProduct(updated); setStocks(updated.stocks); setNotice("تغییرات محصول ذخیره شد."); router.refresh(); }
    } catch (err) { setError((err as Error).message); }
    finally { setPending(false); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setError("");
    try {
      if (files.length + product.media.length > 12) throw new Error("حداکثر ۱۲ تصویر برای هر محصول مجاز است.");
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) throw new Error("حجم هر تصویر باید حداکثر ۵ مگابایت باشد.");
        const media = await catalogRequest<{ objectKey: string }>("/api/admin/catalog/media", "POST", file);
        setProduct((p) => ({ ...p, media: [...p.media, { objectKey: media.objectKey, alt: p.name || "تصویر محصول" }] }));
      }
    } catch (err) { setError((err as Error).message); }
    finally { setUploading(false); }
  }
  function moveMedia(index: number, delta: number) { const list = [...product.media]; [list[index], list[index + delta]] = [list[index + delta], list[index]]; set("media", list); }
  return <>
    <div className="editor-toolbar"><Link className="text-link" href="/admin/catalog">→ فهرست محصولات</Link><div className="row-actions">{id && product.status === "ACTIVE" && <Button variant="outline" asChild><Link href={`/products/${product.slug}`} target="_blank">مشاهده در فروشگاه ↗</Link></Button>}{canWrite && <Button form="product-edit-form" type="submit" disabled={pending || uploading}>{pending ? "در حال ذخیره…" : "ذخیره محصول"}</Button>}</div></div>
    <div aria-live="polite">{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{notice && <Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert>}</div>
    <form method="post" className="catalog-form product-editor" id="product-edit-form" onSubmit={submit}>
      <FieldSet disabled={!canWrite || pending || uploading}>
        <FieldLegend className="sr-only">ویرایش اطلاعات محصول</FieldLegend>
        <div className="editor-grid">
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader><CardTitle role="heading" aria-level={2}>اطلاعات اصلی</CardTitle></CardHeader>
              <CardContent><FieldGroup>
                <Field><FieldLabel htmlFor="product-name">نام محصول</FieldLabel><Input id="product-name" required maxLength={160} value={product.name} onChange={(e) => set("name", e.target.value)} /></Field>
                <FieldGroup className="grid gap-5 md:grid-cols-2">
                  <Field><FieldLabel htmlFor="product-slug">نامک آدرس</FieldLabel><Input id="product-slug" required maxLength={160} dir="ltr" placeholder="dr-biz-honey-900g" value={product.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
                  <Field><FieldLabel htmlFor="product-brand">برند</FieldLabel><NativeSelect id="product-brand" value={product.brandId ?? ""} onChange={(e) => set("brandId", e.target.value || null)}><NativeSelectOption value="">بدون برند</NativeSelectOption>{lookups.brands.map((b) => <NativeSelectOption key={b.id} value={b.id}>{b.name}</NativeSelectOption>)}</NativeSelect></Field>
                </FieldGroup>
                <Field><FieldLabel htmlFor="product-description">توضیحات محصول</FieldLabel><Textarea id="product-description" rows={6} maxLength={20000} value={product.description} onChange={(e) => set("description", e.target.value)} /><FieldDescription>متن ساده نمایش داده می‌شود. ادعاها و مشخصات را بر اساس برچسب محصول بنویسید.</FieldDescription></Field>
              </FieldGroup></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle role="heading" aria-level={2}>تصاویر محصول</CardTitle><CardDescription>تصویر اول، تصویر اصلی است.</CardDescription></CardHeader>
              <CardContent><FieldGroup>
                <div className="media-grid">{product.media.map((m, i) => <div className="media-item" key={m.objectKey}>
                  <Image src={`/api/media/${m.objectKey}`} alt={m.alt} width={220} height={180} unoptimized />
                  <Field><FieldLabel htmlFor={`media-alt-${i}`}>متن جایگزین تصویر {(i + 1).toLocaleString("fa-IR")}</FieldLabel><Input id={`media-alt-${i}`} required maxLength={160} value={m.alt} onChange={(e) => set("media", product.media.map((item, index) => index === i ? { ...item, alt: e.target.value } : item))} /></Field>
                  <div className="row-actions"><Button type="button" variant="ghost" disabled={i === 0 || !canWrite} onClick={() => moveMedia(i, -1)} aria-label="جابه‌جایی به قبل">→</Button><Button type="button" variant="ghost" disabled={i === product.media.length - 1 || !canWrite} onClick={() => moveMedia(i, 1)} aria-label="جابه‌جایی به بعد">←</Button><Button type="button" variant="destructive" size="sm" onClick={() => set("media", product.media.filter((_, index) => index !== i))}>برداشتن</Button></div>
                </div>)}</div>
                {canWrite && <Field><FieldLabel htmlFor="product-media">{uploading ? "در حال بارگذاری…" : "بارگذاری تصویر"}</FieldLabel><Input id="product-media" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} /><FieldDescription>PNG، JPEG یا WebP؛ حداکثر ۵ مگابایت برای هر تصویر</FieldDescription></Field>}
              </FieldGroup></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle role="heading" aria-level={2}>مشخصات محصول</CardTitle></CardHeader>
              <CardContent>{ruleError ? <Alert variant="destructive"><AlertDescription>{ruleError}</AlertDescription></Alert> : definitions(false).length ? <AttributeFields definitions={definitions(false)} values={product.attributes} requiredIds={requiredIds} disabled={!canWrite || pending || uploading} onChange={(values) => set("attributes", values)} /> : <FieldDescription>ویژگی‌های مشخص‌شده در دسته‌بندی، اینجا نمایش داده می‌شوند.</FieldDescription>}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle role="heading" aria-level={2}>تنوع‌ها و قیمت</CardTitle><CardDescription>هر وزن یا نوع بسته‌بندی، کد و قیمت مستقل دارد. تنوع ثبت‌شده را با غیرفعال‌کردن از فروش خارج کنید.</CardDescription></CardHeader>
              <CardContent><FieldGroup>{product.variants.map((v, i) => <FieldSet className="min-w-0" key={v.id ?? `new-${i}`}>
                <FieldLegend>تنوع {(i + 1).toLocaleString("fa-IR")}</FieldLegend>
                <FieldGroup className="grid gap-5 md:grid-cols-2">
                  <Field><FieldLabel htmlFor={`variant-name-${i}`}>عنوان تنوع</FieldLabel><Input id={`variant-name-${i}`} required maxLength={160} value={v.name} onChange={(e) => variant(i, { name: e.target.value })} /></Field>
                  <Field><FieldLabel htmlFor={`variant-sku-${i}`}>کد محصول (SKU)</FieldLabel><Input id={`variant-sku-${i}`} required dir="ltr" maxLength={100} pattern="[A-Za-z0-9._-]+" value={v.sku} onChange={(e) => variant(i, { sku: e.target.value })} /></Field>
                  <Field><FieldLabel htmlFor={`variant-price-${i}`}>قیمت فروش (تومان)</FieldLabel><Input id={`variant-price-${i}`} required type="number" min={0} max={900000000000000} step="0.1" dir="ltr" value={tomanInput(v.priceRial)} onChange={(e) => { const rial = rialInput(e.target.value); if (rial !== null) variant(i, { priceRial: rial }); }} /></Field>
                  <Field><FieldLabel htmlFor={`variant-barcode-${i}`}>بارکد (اختیاری)</FieldLabel><Input id={`variant-barcode-${i}`} dir="ltr" maxLength={64} value={v.barcode} onChange={(e) => variant(i, { barcode: e.target.value })} /></Field>
                  {!definitions(true).some((a) => a.key === "net-weight") && <Field><FieldLabel htmlFor={`variant-weight-${i}`}>وزن خالص (گرم)</FieldLabel><Input id={`variant-weight-${i}`} type="number" min={1} max={10000000} value={v.netWeightGrams ?? ""} onChange={(e) => variant(i, { netWeightGrams: e.target.value ? Number(e.target.value) : null })} /></Field>}
                  <Field><FieldLabel htmlFor={`variant-shipping-weight-${i}`}>وزن برای ارسال (گرم)</FieldLabel><Input id={`variant-shipping-weight-${i}`} type="number" min={1} max={10000000} value={v.shippingWeightGrams ?? ""} onChange={(e) => variant(i, { shippingWeightGrams: e.target.value ? Number(e.target.value) : null })} /></Field>
                </FieldGroup>
                <AttributeFields definitions={definitions(true)} values={v.attributes} requiredIds={requiredIds} disabled={!canWrite || pending || uploading} onChange={(values) => { const weightId = definitions(true).find((a) => a.key === "net-weight")?.id; const weight = values.find((a) => a.attributeId === weightId); variant(i, { attributes: values, ...(weightId ? { netWeightGrams: weight && Number.isInteger(Number(canonicalNumber(weight.value))) ? Number(canonicalNumber(weight.value)) : null } : {}) }); }} />
                <Field orientation="horizontal" data-disabled={!canWrite || pending || uploading}><Checkbox id={`variant-active-${i}`} disabled={!canWrite || pending || uploading} checked={v.isActive} onCheckedChange={(checked) => variant(i, { isActive: checked === true })} /><FieldLabel htmlFor={`variant-active-${i}`}>این تنوع برای نمایش فعال است</FieldLabel></Field>
                {!v.id && product.variants.length > 1 && <Button type="button" variant="destructive" size="sm" className="self-start" onClick={() => set("variants", product.variants.filter((_, index) => index !== i))}>برداشتن تنوع</Button>}
              </FieldSet>)}</FieldGroup></CardContent>
              {canWrite && <CardFooter><Button type="button" variant="outline" disabled={product.variants.length >= 50} onClick={() => set("variants", [...product.variants, { ...blankProduct.variants[0], name: "", attributes: [] }])}>+ افزودن تنوع</Button></CardFooter>}
            </Card>
            <Card>
              <CardHeader><CardTitle role="heading" aria-level={2}>نمایش در موتور جست‌وجو</CardTitle></CardHeader>
              <CardContent><FieldGroup><Field><FieldLabel htmlFor="product-seo-title">عنوان سئو</FieldLabel><Input id="product-seo-title" maxLength={160} value={product.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} /></Field><Field><FieldLabel htmlFor="product-seo-description">توضیحات سئو</FieldLabel><Textarea id="product-seo-description" rows={3} maxLength={320} value={product.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} /></Field></FieldGroup></CardContent>
            </Card>
          </div>
          <aside className="flex min-w-0 flex-col gap-6">
            <Card><CardHeader><CardTitle role="heading" aria-level={2}>انتشار</CardTitle><CardDescription>انتشار به تصویر، توضیحات، دسته‌بندی اصلی فعال، قیمت و ویژگی‌های اجباری نیاز دارد. موجودی صفر با برچسب ناموجود نمایش داده می‌شود.</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel id="product-status-label">وضعیت محصول</FieldLabel><ToggleGroup type="single" variant="outline" aria-labelledby="product-status-label" value={product.status} disabled={!canWrite || pending || uploading} onValueChange={(value) => value && set("status", value as ProductInput["status"])} className="flex flex-wrap">{Object.entries(statusNames).map(([key, name]) => <ToggleGroupItem key={key} value={key}>{name}</ToggleGroupItem>)}</ToggleGroup></Field></FieldGroup></CardContent></Card>
            <Card><CardHeader><CardTitle role="heading" aria-level={2}>دسته‌بندی‌ها</CardTitle><CardDescription>با تغییر دسته‌بندی، مشخصات نامرتبط از فرم برداشته می‌شوند.</CardDescription></CardHeader><CardContent><FieldGroup>
              <FieldSet><FieldLegend variant="label">گروه‌های محصول</FieldLegend><FieldGroup className="gap-3">{lookups.categories.map((c) => <Field orientation="horizontal" key={c.id} data-disabled={!canWrite || pending || uploading}><Checkbox id={`product-category-${c.id}`} disabled={!canWrite || pending || uploading} checked={product.categoryIds.includes(c.id)} onCheckedChange={(checked) => categories(checked === true ? [...product.categoryIds, c.id] : product.categoryIds.filter((n) => n !== c.id))} /><FieldLabel htmlFor={`product-category-${c.id}`}>{c.parentId ? `${lookups.categories.find((n) => n.id === c.parentId)?.name ?? ""} / ` : ""}{c.name}{!c.isActive ? " (غیرفعال)" : ""}</FieldLabel></Field>)}</FieldGroup></FieldSet>
              <Field><FieldLabel htmlFor="product-primary-category">دسته‌بندی اصلی</FieldLabel><NativeSelect id="product-primary-category" value={product.primaryCategoryId ?? ""} onChange={(e) => set("primaryCategoryId", e.target.value || null)}><NativeSelectOption value="">انتخاب کنید</NativeSelectOption>{lookups.categories.filter((c) => product.categoryIds.includes(c.id)).map((c) => <NativeSelectOption value={c.id} key={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect></Field>
            </FieldGroup></CardContent></Card>
            <Card><CardHeader><CardTitle role="heading" aria-level={2}>تگ‌ها</CardTitle></CardHeader><CardContent><FieldSet><FieldLegend variant="label">کلمات کلیدی محصول</FieldLegend><FieldGroup className="gap-3">{lookups.tags.map((t) => <Field orientation="horizontal" key={t.id} data-disabled={!canWrite || pending || uploading}><Checkbox id={`product-tag-${t.id}`} disabled={!canWrite || pending || uploading} checked={product.tagIds.includes(t.id)} onCheckedChange={(checked) => set("tagIds", checked === true ? [...product.tagIds, t.id] : product.tagIds.filter((id) => id !== t.id))} /><FieldLabel htmlFor={`product-tag-${t.id}`}>{t.name}</FieldLabel></Field>)}</FieldGroup></FieldSet></CardContent><CardFooter><Link className="text-link" href="/admin/catalog/taxonomy">مدیریت دسته‌بندی، تگ و برند ←</Link></CardFooter></Card>
          </aside>
        </div>
      </FieldSet>
    </form>
    {stocks.length > 0 && <Card><CardHeader><CardTitle role="heading" aria-level={2}>کنترل موجودی</CardTitle><CardDescription>تغییر موجودی مستقل از دکمهٔ ذخیرهٔ محصول ثبت می‌شود.</CardDescription></CardHeader><CardContent>{stocks.map((s) => <StockAdjustment key={`${s.variantId}-${s.version}`} initial={s} label={product.variants.find((v) => v.id === s.variantId)?.name ?? "تنوع"} canWrite={canInventory} />)}</CardContent></Card>}
    {!id && <FieldDescription>ابتدا محصول را ذخیره کنید؛ سپس موجودی هر تنوع را در همین صفحه ثبت کنید.</FieldDescription>}
  </>;
}
