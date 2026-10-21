import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/auth-frame";
import { CustomerLogin } from "@/components/auth/customer-login";
export const metadata: Metadata = { title: "ورود به حساب", robots: { index: false, follow: false } };
export default function LoginPage() { return <AuthFrame><CustomerLogin /></AuthFrame>; }
