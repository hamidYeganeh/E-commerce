import {notificationLabels} from "@/modules/operations/notification-definitions";
import {Empty,EmptyHeader,EmptyTitle} from "@/components/ui/empty";
import {Suspense} from "react";
import Link from "next/link";
import {notFound} from "next/navigation";
import {AdminShell} from "@/components/admin/admin-shell";
import {DeskAction} from "@/components/operations/desk-actions";
import {requirePageIdentity} from "@/modules/identity/request";
import {getDatabase} from "@/infrastructure/database/server";
import {deskKinds,deskPermissions,readDesk,type DeskKind} from "@/modules/operations/admin";
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from "@/components/ui/card";
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from "@/components/ui/table";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
const names={customers:"بانک مشتریان",leads:"سرنخ‌های مشاوره",restock:"درخواست‌های موجودشدن",notifications:"تاریخچهٔ پیامک",carts:"سبدهای رهاشده","low-stock":"کالاهای رو به اتمام"};
const date=(v:unknown)=>v?new Date(String(v)).toLocaleDateString("fa-IR"):"—";
const obj=(v:unknown)=>(v??{}) as Record<string,unknown>;
const text=(v:unknown)=>String(v??"—");
export const metadata={title:"مدیریت مشتریان و عملیات",robots:{index:false,follow:false}};
export default function Page(props:{params:Promise<{kind:string}>;searchParams:Promise<Record<string,string|undefined>>}){return <Suspense fallback={<p>در حال دریافت…</p>}><Content {...props}/></Suspense>;}
async function Content({params,searchParams}:{params:Promise<{kind:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const slug=(await params).kind;if(!deskKinds.includes(slug as DeskKind))notFound();const kind=slug as DeskKind,p=await searchParams,q=(p.q??"").slice(0,100),page=Math.max(1,Math.min(100000,Number.parseInt(p.page??"1")||1));
 const identity=await requirePageIdentity(true,false,deskPermissions[kind]),data=await readDesk(getDatabase(),identity.user.id,kind,q,page);
 const rows=data.rows as unknown as Record<string,unknown>[];
 const headers=kind==="customers"?["مشتری","موبایل","آخرین خرید","تعداد سفارش","عملیات"]:kind==="leads"?["نام و موبایل","صفحهٔ مبدا","وضعیت","تاریخ","عملیات"]:kind==="restock"?["مشتری","محصول","موبایل","اطلاع‌رسانی"]:kind==="notifications"?["گیرنده / رویداد","متن","وضعیت / تلاش","تاریخ","عملیات"]:kind==="carts"?["مشتری","اقلام","مبلغ فعلی کالا (ریال)","آخرین فعالیت"]:["محصول","تنوع","SKU","قابل فروش","پیشنهاد تأمین"];
 return <AdminShell identity={identity} current="operations"><Card><CardHeader><CardTitle role="heading" aria-level={1}>{names[kind]}</CardTitle><CardDescription>{data.total.toLocaleString("fa-IR")} رکورد؛ شماره‌های ثبت‌شده به‌تنهایی رضایت دریافت تبلیغات نیستند.</CardDescription></CardHeader><CardContent><form className="flex gap-2 mb-6"><Input name="q" defaultValue={q} placeholder="جست‌وجو" aria-label="جست‌وجو"/><Button variant="outline">جست‌وجو</Button></form><div className="flex flex-wrap gap-2 mb-4">{kind==="customers"&&identity.permissions.includes("customers.write")&&<DeskAction action="customer"/>}{kind==="customers"&&<Button variant="outline" asChild><Link href={`/api/admin/exports/customers?${new URLSearchParams({q,page:String(Math.floor((page-1)*20/1000)+1)})}`} prefetch={false} download>خروجی اکسل مشتریان</Link></Button>}{kind==="low-stock"&&<Button asChild variant="outline"><Link href="/admin/bulk">ویرایش گروهی و اکسل قیمت</Link></Button>}</div><div className="overflow-x-auto"><Table><TableHeader><TableRow>{headers.map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(r=>{const id=text(r.id);let cells:React.ReactNode[]=[];
 if(kind==="customers"){const last=Array.isArray(r.orders)?obj(r.orders[0]):{};cells=[text(r.name),<a key="tel" href={`tel:${text(r.phoneNumber)}`} dir="ltr">{text(r.phoneNumber)}</a>,date(last.confirmedAt),text(obj(r._count).orders),<Link key="detail" className="text-link" href={`/admin/customers/${id}`}>سوابق و کیف پول ←</Link>];}
 if(kind==="leads")cells=[<span key="contact">{text(r.name)}<a className="block" dir="ltr" href={`tel:${text(r.phone)}`}>{text(r.phone)}</a></span>,`${text(r.sourceType)} / ${text(r.sourceId)}`,({NEW:"جدید",CONTACTED:"تماس گرفته شد",QUALIFIED:"مستعد خرید",CLOSED:"بسته‌شده"}[text(r.status)]??text(r.status)),date(r.createdAt),identity.permissions.includes("customers.write")?<DeskAction key="action" action="lead" id={id} initialStatus={text(r.status)} initialNote={text(r.note??"")}/>:"—"];
 if(kind==="restock")cells=[text(obj(r.user).name),`${text(obj(obj(r.variant).product).name)} / ${text(obj(r.variant).name)}`,text(obj(r.user).phoneNumber),r.sentAt?date(r.sentAt):"در انتظار موجودی و ارسال پیامک"];
 if(kind==="notifications")cells=[`${text(r.phone)} / ${notificationLabels[text(r.topic)]??text(r.topic)}`,text(r.text),`${({QUEUED:"در صف",SENDING:"در حال ارسال",SENT:"ارسال‌شده",DISABLED:"غیرفعال",NEEDS_REVIEW:"نیازمند بررسی",FAILED:"ناموفق"}[text(r.status)]??text(r.status))} / ${Number(r.attempts??0).toLocaleString("fa-IR")}`,date(r.sentAt??r.createdAt),["NEEDS_REVIEW","FAILED"].includes(text(r.status))?<DeskAction key="action" action="notification" id={id}/>:text(r.lastError??r.providerRef??"—")];
 if(kind==="carts"){const items=(r.items??[]) as Record<string,unknown>[];cells=[text(obj(r.user).name??"مهمان"),items.map(i=>`${text(obj(i.variant).name)} × ${text(i.quantity)}`).join("، "),items.reduce((s,i)=>s+BigInt(text(obj(i.variant).priceRial))*BigInt(text(i.quantity)),0n).toLocaleString("fa-IR"),date(r.updatedAt)];}
 if(kind==="low-stock")cells=[text(r.product),text(r.name),text(r.sku),text(r.available),text(r.suggested)];
 return <TableRow key={id}>{cells.map((c,i)=><TableCell key={i}>{c}</TableCell>)}</TableRow>;
 })}</TableBody></Table></div>{!rows.length&&<Empty><EmptyHeader><EmptyTitle>رکوردی پیدا نشد</EmptyTitle></EmptyHeader></Empty>}</CardContent><CardFooter className="gap-4">{page>1&&<Link href={`?${new URLSearchParams({q,page:String(page-1)})}`}>صفحه قبل</Link>}<span>صفحه {page.toLocaleString("fa-IR")}</span>{page*(kind==="customers"?20:25)<data.total&&<Link href={`?${new URLSearchParams({q,page:String(page+1)})}`}>صفحه بعد</Link>}</CardFooter></Card></AdminShell>;
}
