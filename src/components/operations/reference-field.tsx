"use client";
import {Input} from "@/components/ui/input";
import {Checkbox} from '@/components/ui/checkbox';
import {Field,FieldLabel,FieldSet,FieldLegend,FieldGroup} from '@/components/ui/field';
import {NativeSelect,NativeSelectOption} from '@/components/ui/native-select';
import {ToggleGroup,ToggleGroupItem} from '@/components/ui/toggle-group';
export type ReferenceOptions=Record<string,{id:string;name:string}[]>;
export function ReferenceField({id,options,value,onChange,multiple=false}:{id:string;options:{id:string;name:string}[];value:string;onChange:(v:string)=>void;multiple?:boolean}){
 const chosen=value.split(/[,،\n]/).map(v=>v.trim()).filter(Boolean);
 if(multiple)return <FieldSet><FieldLegend className="sr-only">انتخاب موارد مرتبط</FieldLegend><FieldGroup data-slot="checkbox-group" className="max-h-64 overflow-y-auto border rounded-lg p-3">{options.map(o=><Field orientation="horizontal" key={o.id}><Checkbox id={`${id}-${o.id}`} checked={chosen.includes(o.id)} onCheckedChange={v=>onChange((v===true?[...chosen,o.id]:chosen.filter(i=>i!==o.id)).join(','))}/><FieldLabel htmlFor={`${id}-${o.id}`}>{o.name}</FieldLabel></Field>)}</FieldGroup><Field><FieldLabel htmlFor={`${id}-manual`}>شناسهٔ موارد خارج از فهرست (با ویرگول)</FieldLabel><Input id={`${id}-manual`} value={value} onChange={e=>onChange(e.target.value)} dir="ltr"/></Field></FieldSet>;
 if(options.length>0&&options.length<7)return <ToggleGroup id={id} type="single" variant="outline" value={value||'__none__'} onValueChange={v=>v&&onChange(v==='__none__'?'':v)} className="flex flex-wrap" aria-label="انتخاب مورد مرتبط"><ToggleGroupItem value="__none__">بدون انتخاب</ToggleGroupItem>{options.map(o=><ToggleGroupItem key={o.id} value={o.id}>{o.name}</ToggleGroupItem>)}</ToggleGroup>;
 return <FieldGroup><NativeSelect id={id} value={value} onChange={e=>onChange(e.target.value)}><NativeSelectOption value="">انتخاب کنید</NativeSelectOption>{options.map(o=><NativeSelectOption key={o.id} value={o.id}>{o.name}</NativeSelectOption>)}</NativeSelect><Field><FieldLabel htmlFor={`${id}-manual`}>شناسهٔ مورد خارج از فهرست</FieldLabel><Input id={`${id}-manual`} value={value} onChange={e=>onChange(e.target.value)} dir="ltr"/></Field></FieldGroup>;
}
