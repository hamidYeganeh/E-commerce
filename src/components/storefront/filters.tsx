"use client";
import Link from "next/link";
import { useState } from "react";
import { SlidersHorizontalIcon, PlusIcon, MinusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption as Option } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { PublicFilters, listPublicProducts } from "@/modules/catalog/repository";
type Listing = Awaited<ReturnType<typeof listPublicProducts>>;
type Props = { data: Pick<Listing, "categories" | "tags" | "brands" | "filterAttributes">; filters: PublicFilters };
export function StoreFilterPanel(props: Props) {
  const [expanded, setExpanded] = useState(false);
  return <div className="mobile-filters t-acc" data-open={expanded}><Button variant="outline" type="button" className="filter-toggle" aria-expanded={expanded} aria-controls="store-filters" onClick={() => setExpanded(!expanded)}><SlidersHorizontalIcon data-icon="inline-start" />جست‌وجو و فیلتر محصولات {expanded ? <MinusIcon /> : <PlusIcon />}</Button><div id="store-filters" className={`filters-content t-acc-panel${expanded ? " is-open" : ""}`}><div className="t-acc-panel-inner"><StoreFilters {...props} /></div></div></div>;
}
export function StoreFilters({ data, filters }: Props) {
  const [attribute, setAttribute] = useState(filters.attribute ?? "");
  const selected = data.filterAttributes.find(a => a.key === attribute);
  return <form className="store-filters" action="/products" method="get"><div className="section-heading"><h2>جست‌وجو و فیلتر</h2><Button variant="ghost" size="sm" asChild><Link href="/products">پاک کردن</Link></Button></div><FieldGroup>
    <Field><FieldLabel htmlFor="filter-query">جست‌وجوی محصول</FieldLabel><Input id="filter-query" name="q" defaultValue={filters.q} maxLength={100} placeholder="نام محصول…" /></Field>
    <Field><FieldLabel htmlFor="filter-category">دسته‌بندی</FieldLabel><NativeSelect id="filter-category" name="category" defaultValue={filters.category ?? ""}><Option value="">همه دسته‌بندی‌ها</Option>{data.categories.map(c => <Option value={c.slug} key={c.id}>{c.parentId ? `${data.categories.find(n => n.id === c.parentId)?.name ?? ""} / ` : ""}{c.name}</Option>)}</NativeSelect></Field>
    <Field><FieldLabel htmlFor="filter-brand">برند</FieldLabel><NativeSelect id="filter-brand" name="brand" defaultValue={filters.brand ?? ""}><Option value="">همه برندها</Option>{data.brands.map(b => <Option key={b.slug} value={b.slug}>{b.name}</Option>)}</NativeSelect></Field>
    <Field><FieldLabel htmlFor="filter-tag">تگ</FieldLabel><NativeSelect id="filter-tag" name="tag" defaultValue={filters.tag ?? ""}><Option value="">همه تگ‌ها</Option>{data.tags.map(t => <Option value={t.slug} key={t.slug}>{t.name}</Option>)}</NativeSelect></Field>
    <div className="form-grid"><Field><FieldLabel htmlFor="filter-min">از قیمت (تومان)</FieldLabel><Input id="filter-min" name="min" type="number" min={0} max={900000000000000} defaultValue={filters.min} /></Field><Field><FieldLabel htmlFor="filter-max">تا قیمت (تومان)</FieldLabel><Input id="filter-max" name="max" type="number" min={0} max={900000000000000} defaultValue={filters.max} /></Field></div>
    {data.filterAttributes.length > 0 && <><Field><FieldLabel htmlFor="filter-attribute">ویژگی</FieldLabel><NativeSelect id="filter-attribute" name="attribute" value={attribute} onChange={e => setAttribute(e.target.value)}><Option value="">انتخاب ویژگی</Option>{data.filterAttributes.map(a => <Option key={a.id} value={a.key}>{a.name}</Option>)}</NativeSelect></Field>{selected && <Field><FieldLabel htmlFor="filter-option">مقدار {selected.name}</FieldLabel>{selected.type === "SELECT" || selected.type === "BOOLEAN" ? <NativeSelect id="filter-option" key={attribute} name="option" defaultValue={filters.attribute === attribute ? filters.option : ""}><Option value="">همه مقدارها</Option>{selected.type === "BOOLEAN" ? <><Option value="true">بله</Option><Option value="false">خیر</Option></> : selected.options.map(o => <Option key={o.id} value={o.id}>{o.label}</Option>)}</NativeSelect> : <Input id="filter-option" key={attribute} name="option" maxLength={500} defaultValue={filters.attribute === attribute ? filters.option : ""} inputMode={selected.type === "NUMBER" ? "decimal" : "text"} />}</Field>}</>}
    <Field><FieldLabel htmlFor="filter-sort">مرتب‌سازی</FieldLabel><NativeSelect id="filter-sort" name="sort" defaultValue={filters.sort ?? "newest"}><Option value="newest">جدیدترین</Option><Option value="price-asc">قیمت: کم به زیاد</Option><Option value="price-desc">قیمت: زیاد به کم</Option></NativeSelect></Field>
    <Field orientation="horizontal"><Checkbox id="filter-stock" name="stock" value="1" defaultChecked={filters.stock === "1"} /><FieldLabel htmlFor="filter-stock">فقط کالاهای موجود</FieldLabel></Field><Button type="submit"><SearchIcon data-icon="inline-start" />نمایش محصولات</Button>
  </FieldGroup></form>;
}
