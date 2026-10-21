"use client";
import {useState} from "react";
import {useCart} from "@/components/commerce/cart-store";
import {Checkbox} from "@/components/ui/checkbox";
import {Field,FieldLabel} from "@/components/ui/field";
import {Button} from "@/components/ui/button";
export function Preferences({marketingConsent}:{marketingConsent:boolean}){const {lines}=useCart(),[checked,setChecked]=useState(marketingConsent),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);async function save(){setBusy(true);try{const r=await fetch("/api/account/cart",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({lines,marketingConsent:checked})});setMessage(r.ok?"تنظیمات ذخیره شد.":"ذخیره نشد؛ دوباره تلاش کنید.");}catch{setMessage("ذخیره نشد.");}finally{setBusy(false);}}return <div className="grid gap-4"><Field orientation="horizontal"><Checkbox id="marketing-consent" checked={checked} onCheckedChange={v=>setChecked(v===true)}/><FieldLabel htmlFor="marketing-consent">پیشنهادها و یادآوری تکمیل خرید را با پیامک دریافت کنم.</FieldLabel></Field><Button variant="outline" disabled={busy} onClick={save}>ذخیرهٔ ترجیحات</Button>{message&&<p role="status">{message}</p>}</div>;}
