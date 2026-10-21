import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import Link from "next/link";
import { StoreHeader, StoreFooter } from "./store-navigation";
export function StoreShell({ children, current = "products" }: { children: React.ReactNode; current?: string }) {
  return <div className="store vb-landing"><a className="skip-link" href="#store-content">رفتن به محتوای اصلی</a><StoreHeader current={current} /><main id="store-content">{children}</main><StoreFooter widgets={!["account","cart","checkout"].includes(current)}/></div>;
}
export function StoreUnavailable() { return <Empty className="store-unavailable" role="status"><EmptyHeader><EmptyTitle>دریافت محصولات امکان‌پذیر نیست</EmptyTitle><EmptyDescription>لطفاً کمی بعد دوباره تلاش کنید.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" asChild><Link href="/products">تلاش دوباره</Link></Button></EmptyContent></Empty>; }
