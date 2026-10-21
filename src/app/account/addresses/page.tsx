import{Suspense}from"react";
import Link from"next/link";
import{getDatabase}from"@/infrastructure/database/server";
import{requirePageIdentity}from"@/modules/identity/request";
import{ActionForm,type ActionField}from"@/components/operations/action-form";
import{Card,CardHeader,CardTitle,CardDescription,CardContent}from"@/components/ui/card";
export const metadata={title:"دفترچهٔ نشانی",robots:{index:false,follow:false}};
const labels:Record<string,string>={recipientName:"نام گیرنده",phoneNumber:"موبایل",province:"استان",city:"شهر",addressLine:"نشانی کامل",postalCode:"کد پستی"};
export default function Page(){return <Suspense fallback={<p>در حال دریافت…</p>}><Content/></Suspense>;}
async function Content(){const i=await requirePageIdentity(),rows=await getDatabase().address.findMany({where:{userId:i.user.id},orderBy:{updatedAt:"desc"}});const fields=(row:Record<string,unknown>={}):ActionField[]=>Object.entries(labels).map(([name,label])=>({name,label,required:true,value:String(row[name]??"")}));return <main className="store-container max-w-4xl py-10 flex flex-col gap-6"><Link href="/account">حساب من ←</Link>{[null,...rows].map(r=><Card key={r?.id??"new"}><CardHeader><CardTitle>{r?`${r.recipientName} · ${r.city}`:"نشانی تازه"}</CardTitle><CardDescription>نشانی سفارش‌های قبلی با ویرایش دفترچه تغییر نمی‌کند.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><ActionForm endpoint="/api/account/addresses" action="save" title="ذخیرهٔ نشانی" defaults={r?{id:r.id}:{}} fields={fields(r??{})}/>{r&&<ActionForm endpoint="/api/account/addresses" action="delete" title="حذف نشانی" defaults={{id:r.id}}/>}</CardContent></Card>)}</main>;}
