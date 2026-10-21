"use client";
import {useSyncExternalStore} from "react";
import {ActionForm} from "@/components/operations/action-form";
import Link from "next/link";
const subscribe=()=>()=>{};
export function AcceptStaff(){const fragment=useSyncExternalStore(subscribe,()=>location.hash,()=>""),token=new URLSearchParams(fragment.slice(1)).get("token")??"";return <><h1>دعوت یا بازیابی حساب همکار</h1><p>رمز تازه حداقل ۱۲ نویسه باشد. پس از ورود تنظیم عامل دوم لازم است.</p>{token?<ActionForm endpoint="/api/staff/accept" action="accept" title="ثبت رمز" defaults={{token}} fields={[{name:"password",label:"رمز جدید",type:"password",required:true}]}/>:<p>پیوند دعوت معتبر را باز کنید.</p>}<Link href="/staff/login">ورود همکاران</Link></>;}
