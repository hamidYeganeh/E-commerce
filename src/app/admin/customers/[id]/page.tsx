import {pageNumber,historyPageSize} from "@/shared/pagination";
import {Suspense} from "react";
import Link from "next/link";
import {notFound} from "next/navigation";
import {AdminShell} from "@/components/admin/admin-shell";
import {DeskAction} from "@/components/operations/desk-actions";
import {requirePageIdentity} from "@/modules/identity/request";
import {getDatabase} from "@/infrastructure/database/server";
import {customerDetails} from "@/modules/operations/admin";
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from "@/components/ui/card";
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from "@/components/ui/table";
export default function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string}>}){return <Suspense fallback={<p>در حال دریافت…</p>}><Content params={params} searchParams={searchParams}/></Suspense>;}
async function Content({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string}>}){const page=pageNumber((await searchParams).page);const identity=await requirePageIdentity(true,false,"customers.read"),db=getDatabase(),id=(await params).id,customer=await customerDetails(db,identity.user.id,id,page);if(!customer)notFound();const canWallet=identity.permissions.includes("wallet.write"),balance=canWallet?(await db.walletEntry.aggregate({where:{userId:id},_sum:{amountRial:true}}))._sum.amountRial??0n:null;
 return <AdminShell identity={identity} current="operations"><div className="grid gap-6"><Card><CardHeader><CardTitle>{customer.name}</CardTitle><CardDescription><a dir="ltr" href={`tel:${customer.phoneNumber}`}>{customer.phoneNumber}</a> · {customer.phoneNumberVerified?"شماره تأییدشده":"شماره تأیید نشده"}</CardDescription></CardHeader>{canWallet&&<CardContent><p>اعتبار کیف پول: {balance?.toLocaleString("fa-IR")} ریال</p><DeskAction action="wallet" id={id}/></CardContent>}</Card><Card><CardHeader><CardTitle>سوابق خرید</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>سفارش</TableHead><TableHead>تاریخ</TableHead><TableHead>وضعیت</TableHead><TableHead>مبلغ (ریال)</TableHead></TableRow></TableHeader><TableBody>{customer.orders.map(o=><TableRow key={o.id}><TableCell>{identity.permissions.includes("orders.read")?<Link href={`/admin/orders/${o.id}`}>#{o.number}</Link>:`#${o.number}`}</TableCell><TableCell>{o.createdAt.toLocaleDateString("fa-IR")}</TableCell><TableCell>{o.status}</TableCell><TableCell>{identity.permissions.includes("payments.read")?o.totalRial.toLocaleString("fa-IR"):"—"}</TableCell></TableRow>)}</TableBody></Table><nav className="pagination" aria-label="صفحات سوابق خرید">{page>1&&<Link href={`?page=${page-1}`}>صفحه قبل</Link>}<span>صفحه {page.toLocaleString("fa-IR")}</span>{page*historyPageSize<customer._count.orders&&<Link href={`?page=${page+1}`}>صفحه بعد</Link>}</nav>{!customer.orders.length&&<p>هنوز خریدی ثبت نشده است.</p>}</CardContent></Card></div></AdminShell>;
}
