import { StoreShell } from "@/components/storefront/store-shell";
import { CartPage } from "@/components/commerce/cart-page";
export const metadata = { title: "تکمیل خرید", robots: { index: false, follow: false } };
export default function Page() { return <StoreShell current="checkout"><CartPage checkout /></StoreShell>; }
