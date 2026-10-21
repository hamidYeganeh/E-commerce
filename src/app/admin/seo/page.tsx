import {Suspense} from "react";
import Link from "next/link";
import {AdminShell} from "@/components/admin/admin-shell";
import {requirePageIdentity} from "@/modules/identity/request";
import {getDatabase} from "@/infrastructure/database/server";
import {seoAudit} from "@/modules/operations/seo";
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from "@/components/ui/card";
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from "@/components/ui/table";
export default function Page(){return <Suspense fallback={<p>در حال بررسی…</p>}><Content/></Suspense>;}
async function Content(){const identity=await requirePageIdentity(true,false,"catalog.read"),rows=await seoAudit(getDatabase(),identity.user.id);return <AdminShell identity={identity} current="operations"><Card><CardHeader><CardTitle>بررسی سئوی محتوا</CardTitle><CardDescription>بررسی فنی عنوان، متا، محتوا، تصویر و نمایه‌سازی؛ این نتیجه تضمین رتبهٔ گوگل نیست. حداکثر ۱۰۰۰ مورد از هر نوع بررسی می‌شود.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>نوع</TableHead><TableHead>صفحه</TableHead><TableHead>موارد قابل بهبود</TableHead><TableHead>ویرایش</TableHead></TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.id}><TableCell>{r.kind}</TableCell><TableCell><Link href={r.path}>{r.title}</Link></TableCell><TableCell>{r.issues.join("، ")||"بررسی پایه کامل است"}</TableCell><TableCell><Link href={r.edit}>ویرایش</Link></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></AdminShell>;}
