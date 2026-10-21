"use client";
import{useState}from"react";
import{useRouter}from"next/navigation";
import{replaceCartLines}from"./cart-store";
import{Button}from"@/components/ui/button";
import{Alert,AlertDescription}from"@/components/ui/alert";
export function ReorderButton({orderId}:{orderId:string}){const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");return <div><Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await fetch(`/api/account/orders/${orderId}/reorder`,{method:"POST"}),d=await r.json();if(!r.ok)throw new Error(d.message);replaceCartLines(d.lines);router.push("/cart");}catch(e){setMessage(e instanceof Error?e.message:"انجام نشد.");}finally{setBusy(false);}}}>خرید مجدد با قیمت و موجودی روز</Button>{message&&<Alert><AlertDescription>{message}</AlertDescription></Alert>}</div>;}
