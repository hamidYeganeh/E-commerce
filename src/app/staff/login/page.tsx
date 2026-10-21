import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/auth-frame";
import { StaffLogin } from "@/components/auth/staff-login";
export const metadata: Metadata = { title: "ورود همکاران", robots: { index: false, follow: false } };
export default function StaffLoginPage() { return <AuthFrame staff><StaffLogin /></AuthFrame>; }
