"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend, FieldDescription } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";


import { useState, type FormEvent } from "react";
import type { CatalogLookups, CategoryRule } from "@/modules/catalog/contracts";
import type { TaxonomyKind } from "@/modules/catalog/management";
import { catalogRequest } from "./client";

const labels: Record<TaxonomyKind, string> = { categories: "دسته‌بندی‌ها", tags: "تگ‌ها", brands: "برندها", attributes: "ویژگی‌ها" };
const blank = { name: "", slug: "", description: "", seoTitle: "", seoDescription: "", parentId: "", isActive: true, isIndexable: false, position: 0, key: "", type: "TEXT", unit: "", optionsText: "", attributes: [] as CategoryRule[] };
export function TaxonomyManager({ initial, canWrite }: { initial: CatalogLookups; canWrite: boolean }) {
  const [data, setData] = useState(initial);
  const [kind, setKind] = useState<TaxonomyKind>("categories");
  const [id, setId] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function reset(next = kind) { setKind(next); setId(null); setForm({ ...blank, attributes: [] }); setError(""); setNotice(""); }
  function edit(recordId: string) {
    const record = data[kind].find((r) => r.id === recordId)!;
    setForm({ ...blank, ...record, description: "description" in record ? record.description ?? "" : "", seoTitle: "seoTitle" in record ? record.seoTitle ?? "" : "", seoDescription: "seoDescription" in record ? record.seoDescription ?? "" : "", parentId: "parentId" in record ? record.parentId ?? "" : "", unit: "unit" in record ? record.unit ?? "" : "", attributes: "attributes" in record ? record.attributes : [], optionsText: "options" in record ? record.options.map((o) => `${o.value} | ${o.label}`).join("\n") : "" });
    setId(recordId); setError(""); setNotice("");
    document.getElementById("taxonomy-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function refresh() { setData(await catalogRequest<CatalogLookups>("/api/admin/catalog/lookups")); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setPending(true);
    try {
      const payload = { ...form, parentId: form.parentId || null, options: form.optionsText.split("\n").filter((v) => v.trim()).map((line) => { const [value, ...label] = line.split("|"); return { value: value.trim(), label: label.join("|").trim() || value.trim() }; }) };
      await catalogRequest(`/api/admin/catalog/taxonomy/${kind}${id ? `/${id}` : ""}`, id ? "PUT" : "POST", payload);
      await refresh(); reset(); setNotice("تغییرات ذخیره شد.");
    } catch (err) { setError((err as Error).message); }
    finally { setPending(false); }
  }
  async function remove(recordId: string) {
    if (!window.confirm("این مورد حذف شود؟ موارد استفاده‌شده قابل حذف نیستند.")) return;
    setPending(true); setError(""); setNotice("");
    try { await catalogRequest(`/api/admin/catalog/taxonomy/${kind}/${recordId}`, "DELETE"); await refresh(); if (id === recordId) reset(); setNotice("حذف شد."); }
    catch (err) { setError((err as Error).message); }
    finally { setPending(false); }
  }
  function toggleRule(attributeId: string) {
    setForm((f) => ({ ...f, attributes: f.attributes.some((r) => r.attributeId === attributeId) ? f.attributes.filter((r) => r.attributeId !== attributeId) : [...f.attributes, { attributeId, categoryId: id ?? "", isRequired: false, isVariant: false, isFilterable: false }] }));
  }
  return <>
    <ToggleGroup type="single" variant="outline" value={kind} onValueChange={value => value && reset(value as TaxonomyKind)} disabled={pending} className="catalog-tabs" aria-label="ساختار کاتالوگ">{Object.entries(labels).map(([key, label]) => <ToggleGroupItem key={key} value={key}>{label} <span>{data[key as TaxonomyKind].length.toLocaleString("fa-IR")}</span></ToggleGroupItem>)}</ToggleGroup>
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="form-success">{notice}</p>}
    <div className="taxonomy-grid"><Card className="panel"><CardHeader><CardTitle>{labels[kind]}</CardTitle>{canWrite && <Button variant="ghost" type="button" disabled={pending} onClick={() => reset()}>+ افزودن</Button>}</CardHeader><CardContent>
      {data[kind].length ? <ul className="taxonomy-list">{data[kind].map((record) => <li key={record.id}><div><strong>{record.name}</strong><small>{"parentId" in record && record.parentId ? `${data.categories.find((c) => c.id === record.parentId)?.name ?? ""} / ` : ""}{"slug" in record ? record.slug : record.key}{"isActive" in record && !record.isActive ? " · غیرفعال" : ""}</small></div><div className="row-actions"><Button variant="ghost" disabled={pending} type="button" onClick={() => edit(record.id)}>{canWrite ? "ویرایش" : "جزئیات"}</Button>{canWrite && <Button variant="destructive" size="sm" disabled={pending} type="button" onClick={() => remove(record.id)} aria-label={`حذف ${record.name}`}>حذف</Button>}</div></li>)}</ul> : <Empty><EmptyHeader><EmptyTitle>هنوز موردی ثبت نشده است</EmptyTitle></EmptyHeader></Empty>}
    </CardContent></Card><Card className="panel" id="taxonomy-editor"><CardHeader><CardTitle>{id ? "ویرایش" : "افزودن"} {labels[kind]}</CardTitle></CardHeader><CardContent><form method="post" className="catalog-form" onSubmit={submit}><FieldSet disabled={!canWrite || pending}><FieldLegend className="sr-only">مشخصات {labels[kind]}</FieldLegend><FieldGroup>
      <Field><FieldLabel htmlFor="taxonomy-name">نام</FieldLabel><Input id="taxonomy-name" required maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field><FieldLabel htmlFor="taxonomy-slug">{kind === "attributes" ? "کلید ثابت ویژگی" : "نامک آدرس"}</FieldLabel><Input id="taxonomy-slug" required dir="ltr" maxLength={160} disabled={kind === "attributes" && !!id} value={kind === "attributes" ? form.key : form.slug} onChange={(e) => setForm({ ...form, [kind === "attributes" ? "key" : "slug"]: e.target.value })} placeholder={kind === "attributes" ? "net-weight" : "honey"} /></Field>
      {kind === "categories" && <><Field><FieldLabel htmlFor="taxonomy-parent">دسته‌بندی والد</FieldLabel><NativeSelect id="taxonomy-parent" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}><NativeSelectOption value="">بدون والد</NativeSelectOption>{data.categories.filter((c) => c.id !== id).map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="taxonomy-position">ترتیب نمایش</FieldLabel><Input id="taxonomy-position" type="number" min={0} max={100000} value={form.position} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} /></Field><Field orientation="horizontal"><Checkbox id="taxonomy-active" checked={form.isActive} onCheckedChange={value => setForm({ ...form, isActive:value===true })}/><FieldLabel htmlFor="taxonomy-active">دسته‌بندی فعال است</FieldLabel></Field></>}
      {kind !== "attributes" && <><Field><FieldLabel htmlFor="taxonomy-description">توضیحات</FieldLabel><Textarea id="taxonomy-description" maxLength={4000} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></Field>{kind !== "brands" && <><Field><FieldLabel htmlFor="taxonomy-seo-title">عنوان سئو</FieldLabel><Input id="taxonomy-seo-title" maxLength={160} value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}/></Field><Field><FieldLabel htmlFor="taxonomy-seo-description">توضیحات سئو</FieldLabel><Textarea id="taxonomy-seo-description" maxLength={320} rows={2} value={form.seoDescription} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}/></Field></>}</>}
      {kind === "tags" && <Field orientation="horizontal"><Checkbox id="taxonomy-indexable" checked={form.isIndexable} onCheckedChange={value => setForm({ ...form, isIndexable:value===true })}/><FieldLabel htmlFor="taxonomy-indexable">صفحهٔ تگ در موتور جست‌وجو نمایه شود</FieldLabel></Field>}
      {kind === "attributes" && <><Field><FieldLabel id="taxonomy-type-label">نوع ویژگی</FieldLabel><ToggleGroup type="single" variant="outline" disabled={!!id} value={form.type} onValueChange={value => value && setForm({ ...form, type:value, optionsText:"" })} aria-labelledby="taxonomy-type-label" className="flex flex-wrap">{[["TEXT","متنی"],["NUMBER","عددی"],["BOOLEAN","بله / خیر"],["SELECT","انتخابی"]].map(([value,label]) => <ToggleGroupItem key={value} value={value}>{label}</ToggleGroupItem>)}</ToggleGroup></Field><Field><FieldLabel htmlFor="taxonomy-unit">واحد (اختیاری)</FieldLabel><Input id="taxonomy-unit" disabled={!!id} maxLength={30} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="گرم"/></Field>{form.type === "SELECT" && <Field><FieldLabel htmlFor="taxonomy-options">گزینه‌ها؛ هر خط: کلید | عنوان فارسی</FieldLabel><Textarea id="taxonomy-options" required rows={6} dir="ltr" value={form.optionsText} onChange={(e) => setForm({ ...form, optionsText: e.target.value })}/><FieldDescription>کلید گزینه‌های قبلی را تغییر ندهید. افزودن گزینه و تغییر عنوان مجاز است.</FieldDescription></Field>}</>}
      {kind === "categories" && <FieldSet><FieldLegend>ویژگی‌های این دسته‌بندی</FieldLegend><FieldDescription>ویژگی‌های والد به زیردسته‌ها ارث می‌رسند. وزن و بسته‌بندی می‌توانند ویژگی تنوع باشند.</FieldDescription><FieldGroup>{data.attributes.map((attr) => { const rule=form.attributes.find(r=>r.attributeId===attr.id);return <FieldSet key={attr.id}><FieldLegend className="sr-only">{attr.name}</FieldLegend><Field orientation="horizontal"><Checkbox id={`attribute-${attr.id}`} checked={!!rule} onCheckedChange={()=>toggleRule(attr.id)}/><FieldLabel htmlFor={`attribute-${attr.id}`}>{attr.name}</FieldLabel></Field>{rule && <FieldGroup>{(["isRequired","isVariant","isFilterable"] as const).map(key => <Field orientation="horizontal" key={key}><Checkbox id={`${attr.id}-${key}`} checked={rule[key]} onCheckedChange={value=>setForm({...form,attributes:form.attributes.map(r=>r.attributeId===attr.id?{...r,[key]:value===true}:r)})}/><FieldLabel htmlFor={`${attr.id}-${key}`}>{{isRequired:"اجباری",isVariant:"ویژگی تنوع",isFilterable:"فیلتر فروشگاه"}[key]}</FieldLabel></Field>)}</FieldGroup>}</FieldSet>;})}{!data.attributes.length && <FieldDescription>ابتدا از زبانهٔ ویژگی‌ها، یک ویژگی ایجاد کنید.</FieldDescription>}</FieldGroup></FieldSet>}
      {canWrite && <Button type="submit">{pending ? "در حال ذخیره…" : "ذخیره تغییرات"}</Button>}
    </FieldGroup></FieldSet></form></CardContent></Card></div>
  </>;
}
