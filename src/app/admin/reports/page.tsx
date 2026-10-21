import {FinancialReportView} from "@/components/operations/financial-report-view";
import {financialReport} from "@/modules/operations/financial-report";
import {Suspense} from "react";
import {AdminShell} from "@/components/admin/admin-shell";
import {requirePageIdentity} from "@/modules/identity/request";
import {getDatabase} from "@/infrastructure/database/server";
import {salesReport} from "@/modules/operations/reports";
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from "@/components/ui/card";
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from "@/components/ui/table";
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription} from "@/components/ui/empty";
import {Skeleton} from "@/components/ui/skeleton";

const n=(value:unknown)=>BigInt(String(value??0)).toLocaleString("fa-IR");
const moneyHeaders=["مبلغ کالا","تخفیف","ارسال","مبلغ نهایی","سفارش","کالا"];
type Period={subtotal:unknown;discount:unknown;shipping:unknown;revenue:unknown;orders:unknown;units:unknown};
const amounts=(row:Period)=>[n(row.subtotal),n(row.discount),n(row.shipping),n(row.revenue),n(row.orders),n(row.units)];

export default function Page({searchParams}:{searchParams:Promise<{from?:string;to?:string;year?:string}>}){
 return <Suspense fallback={<Skeleton className="h-96 w-full" aria-label="در حال محاسبهٔ گزارش"/>}><Content searchParams={searchParams}/></Suspense>;
}
async function Content({searchParams}:{searchParams:Promise<{from?:string;to?:string;year?:string}>}){
 const identity=await requirePageIdentity(true,false,"reports.read");
 const params=await searchParams;const financial=await financialReport(getDatabase(),identity.user.id,Object.fromEntries(Object.entries(params).filter(([,v])=>v)));
 const d=await salesReport(getDatabase(),identity.user.id);
 const metrics=[
  ["مبلغ نهایی ۳۰ روز (ریال)",n(d.totalRevenue)],
  ["مبلغ کالا پیش از تخفیف (ریال)",n(d.totalSubtotal)],
  ["تخفیف ۳۰ روز (ریال)",n(d.totalDiscount)],
  ["ارسال ۳۰ روز (ریال)",n(d.totalShipping)],
  ["سفارش پرداخت‌شدهٔ ۳۰ روز",n(d.totalOrders)],
  ["کالای فروخته‌شدهٔ ۳۰ روز",n(d.totalUnits)],
  ["میانگین کالا در سفارش",d.averageUnits.toLocaleString("fa-IR")],
  ["ثبت‌نام جدید ۳۰ روز",n(d.registrations)],
  ["سبد بی‌فعالیت بیش از ۲ ساعت",n(d.abandoned)],
  ["استرداد موفق از آغاز (ریال)",n(d.refunds)],
  ["برآورد ۷ روز آینده (ریال)",d.forecast?n(d.forecast):"دادهٔ کافی وجود ندارد"],
 ];
 return <AdminShell identity={identity} current="operations"><div className="grid min-w-0 gap-6"><FinancialReportView data={financial}/>
  <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([title,value])=><Card key={title} className="min-w-0"><CardHeader><CardDescription>{title}</CardDescription><CardTitle className="break-words">{value}</CardTitle></CardHeader></Card>)}</div>
  <Report title="فروش روزانه" description="همهٔ مبالغ به ریال؛ روز بر مبنای تهران و فقط سفارش دارای پرداخت تأییدشده. مبلغ نهایی = مبلغ کالا − تخفیف + ارسال. استرداد از این ارقام کم نشده و مجموع آن از آغاز جدا نمایش داده می‌شود. بهای خرید اقلام فروش ثبت نمی‌شود؛ این ارقام سود نیستند. برآورد آینده میانگین روزانهٔ ۳۰ روز ضرب در ۷ است."
   headers={["روز",...moneyHeaders]} rows={d.daily.map(row=>[new Date(`${row.day}T12:00:00Z`).toLocaleDateString("fa-IR"),...amounts(row)])}/>
  <Report title="فروش سالانه (سال میلادی)" description="مبالغ به ریال؛ فقط سفارش دارای پرداخت تأییدشده، پیش از کسر استرداد." headers={["سال",...moneyHeaders]} rows={d.yearly.map(row=>[row.year,...amounts(row)])}/>
  <Report title="پرفروش‌ترین گروه‌ها" headers={["گروه","کالا","مبلغ اقلام ریال"]} rows={d.categories.map(row=>[row.name,n(row.units),n(row.revenue)])}/>
  <Report title="مشتریان وفادار" headers={["مشتری","تعداد خرید","مجموع ریال"]} rows={d.loyal.map(row=>[row.name,n(row.orders),n(row.revenue)])}/>
  <Report title="پربازدیدهای ۳۰ روز اخیر" headers={["نوع","عنوان","بازدیدکننده در روز"]} rows={d.visits.map(row=>[row.kind==="article"?"مقاله":"محصول",row.title,n(row.views)])}/>
 </div></AdminShell>;
}
function Report({title,description,headers,rows}:{title:string;description?:string;headers:string[];rows:string[][]}){
 return <Card className="min-w-0"><CardHeader><CardTitle>{title}</CardTitle>{description&&<CardDescription>{description}</CardDescription>}</CardHeader><CardContent>
  {rows.length?<Table><TableHeader><TableRow>{headers.map(header=><TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row,i)=><TableRow key={i}>{row.map((cell,j)=><TableCell key={j}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table>:<Empty><EmptyHeader><EmptyTitle>هنوز داده‌ای ثبت نشده است</EmptyTitle><EmptyDescription>با ثبت فعالیت، گزارش این بخش نمایش داده می‌شود.</EmptyDescription></EmptyHeader></Empty>}
 </CardContent></Card>;
}
