import { CartSync } from "@/components/operations/cart-sync";
import { PageMotion } from "@/components/motion/page-motion";
import type { Metadata } from "next";
import {Suspense} from "react";
import localFont from "next/font/local";
import "./globals.css";
import "../styles/commerce.css";
import "../styles/commerce-polish.css";
import "../styles/commerce-motion.css";
import "../styles/page-motion.css";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/fa.json";
import { defaultLocale, timeZone } from "@/i18n/config";

const yekanBakh = localFont({
  src: "./fonts/yekan-bakh-variable.woff2",
  variable: "--font-yekan-bakh",
  weight: "100 1000",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "فروشگاه", template: "%s | فروشگاه" },
  description: "فروشگاه محصولات منتخب",
  icons:{icon:"/api/store/favicon"},
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={defaultLocale} dir="rtl" className={`${yekanBakh.variable} h-full font-sans antialiased`}>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={defaultLocale} messages={messages} timeZone={timeZone}>
          <PageMotion>{children}</PageMotion><Suspense fallback={null}><CartSync /></Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
