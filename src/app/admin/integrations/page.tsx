import {Suspense} from "react";
import Link from "next/link";
import {AdminShell} from "@/components/admin/admin-shell";
import {requirePageIdentity} from "@/modules/identity/request";
import {integrationCatalog} from "@/modules/operations/integrations";
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
export default function Page(){return <Suspense fallback={<p>در حال دریافت…</p>}><Content/></Suspense>;}
async function Content(){const identity=await requirePageIdentity(true,false,"settings.write");return <AdminShell identity={identity} current="operations"><div className="page-heading"><h1>سرویس‌های متصل</h1><p>فروشگاه بدون این سرویس‌های اختیاری هم کار می‌کند. فعال‌کردن یک تنظیم، به معنی تأیید اتصال بیرونی نیست.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{integrationCatalog.map(s=><Card key={s.key}><CardHeader><CardTitle>{s.name}</CardTitle><CardDescription>{s.purpose}</CardDescription></CardHeader><CardContent><Badge variant="outline">{s.state==="adapter"?"اتصال برنامه‌نویسی آماده؛ نیازمند حساب":s.state==="registration"?"نیازمند ثبت و تأیید فروشگاه":"نیازمند حساب و مستندات پنل"}</Badge><p className="my-4">{s.needs}</p></CardContent><CardFooter className="gap-2 flex-wrap"><Button variant="outline" asChild><Link href="/admin/operations/integration">تنظیمات</Link></Button>{s.url&&<Button variant="ghost" asChild><a href={s.url} target="_blank" rel="noreferrer">سایت سرویس</a></Button>}</CardFooter></Card>)}</div></AdminShell>;}
