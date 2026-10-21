import{Suspense}from"react";
import{connection}from"next/server";
import{getDatabase}from"@/infrastructure/database/server";
import{bundleSchema}from"@/modules/checkout/discounts";
import{StoreShell}from"@/components/storefront/store-shell";
import{AddBundle}from"@/components/commerce/add-bundle";
import{Card,CardHeader,CardTitle,CardDescription,CardContent}from"@/components/ui/card";
export const metadata={title:"بسته‌های ترکیبی و هدیه"};
export default function Page(){return <StoreShell><Suspense fallback={<p>در حال دریافت بسته‌ها…</p>}><Content/></Suspense></StoreShell>;}
async function Content(){await connection();const db=getDatabase(),rows=await db.storeRecord.findMany({where:{kind:"bundle",status:"ACTIVE"},orderBy:{title:"asc"},take:100});return <main className="store-container py-10 flex flex-col gap-6"><h1>بسته‌های ترکیبی و هدیه</h1><p>بهترین تخفیف قابل‌اعمال بسته یا کد تخفیف محاسبه می‌شود. پیام هدیه را هنگام تسویه وارد کنید.</p>{rows.map(r=>{const b=bundleSchema.parse(r.data);return <Card key={r.id}><CardHeader><CardTitle>{r.title}</CardTitle><CardDescription>{BigInt(b.priceRial).toLocaleString("fa-IR")} ریال برای هر بسته</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><ul>{b.items.map(i=><li key={i.variantId}>{i.quantity} عدد · {i.variantId}</li>)}</ul><AddBundle items={b.items}/></CardContent></Card>;})}{!rows.length&&<p>بستهٔ فعالی وجود ندارد.</p>}</main>;}
