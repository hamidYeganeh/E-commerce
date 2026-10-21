import { StoreShell } from "@/components/storefront/store-shell";
import { CartPage } from "@/components/commerce/cart-page";
export const metadata = { title: "سبد خرید", robots: { index: false, follow: false } };
export default function Page() { return <StoreShell current="cart"><CartPage /></StoreShell>; }
