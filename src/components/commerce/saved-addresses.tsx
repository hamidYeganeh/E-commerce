"use client";
import {useEffect,useState} from "react";
import type {DeliveryAddress} from "@/modules/checkout/contracts";
import {NativeSelect,NativeSelectOption} from "@/components/ui/native-select";
import {Field,FieldLabel} from "@/components/ui/field";
import Link from "next/link";
export function SavedAddresses({onSelect}:{onSelect:(address:DeliveryAddress)=>void}){const[rows,setRows]=useState<(DeliveryAddress&{id:string})[]>([]);useEffect(()=>{const controller=new AbortController();void fetch("/api/account/addresses",{signal:controller.signal}).then(async r=>{if(r.ok)setRows(await r.json());}).catch(()=>{});return()=>controller.abort();},[]);return <Field><FieldLabel htmlFor="saved-address">دفترچهٔ نشانی</FieldLabel><NativeSelect id="saved-address" defaultValue="" onChange={e=>{const row=rows.find(r=>r.id===e.target.value);if(row)onSelect(row);}}><NativeSelectOption value="">نشانی تازه</NativeSelectOption>{rows.map(r=><NativeSelectOption key={r.id} value={r.id}>{r.recipientName} · {r.city} · {r.addressLine}</NativeSelectOption>)}</NativeSelect><Link href="/account/addresses">ثبت و ویرایش نشانی‌ها ←</Link></Field>;}
