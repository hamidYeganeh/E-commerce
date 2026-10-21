"use client";
import {useState} from "react";
import {ToggleGroup,ToggleGroupItem} from "@/components/ui/toggle-group";
export function ShipmentFilter({initial}:{initial:string}){const [value,setValue]=useState(initial||"all");return <><input type="hidden" name="shipment" value={value==="all"?"":value}/><ToggleGroup type="single" variant="outline" value={value} onValueChange={v=>v&&setValue(v)} aria-label="وضعیت ارسال" className="flex flex-wrap">{[["all","همه"],["PACKED","آماده ارسال"],["SHIPPED","ارسال‌شده"],["DELIVERED","تحویل‌شده"]].map(([v,t])=><ToggleGroupItem key={v} value={v}>{t}</ToggleGroupItem>)}</ToggleGroup></>;}
