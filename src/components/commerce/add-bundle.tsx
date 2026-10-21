"use client";
import{useState}from"react";
import{replaceCartLines}from"./cart-store";
import{Button}from"@/components/ui/button";
import Link from"next/link";
export function AddBundle({items}:{items:{variantId:string;quantity:number}[]}){const[message,setMessage]=useState("");return <div className="flex flex-col gap-2"><Button onClick={()=>{try{replaceCartLines(items);setMessage("اقلام بسته جایگزین سبد شد؛ قیمت و موجودی در سبد دوباره بررسی می‌شود.");}catch{setMessage("ذخیرهٔ سبد ممکن نشد.");}}}>انتخاب اقلام این بسته و جایگزینی سبد</Button>{message&&<p role="status">{message} <Link href="/cart">مشاهدهٔ سبد ←</Link></p>}</div>;}
