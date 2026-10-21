import type { Metadata } from "next";
export const metadata: Metadata = { title: "مدیریت", robots: { index: false, follow: false } };
// Each page and each API checks authoritative identity; the layout is not the security boundary.
export default function AdminLayout({ children }: { children: React.ReactNode }) { return children; }
