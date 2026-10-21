"use client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authPost } from "@/modules/identity/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div><Button variant="outline" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try { await authPost("/sign-out"); router.replace("/login"); router.refresh(); }
    catch { setError("خروج انجام نشد. دوباره تلاش کنید."); setBusy(false); }
  }}>{busy ? "در حال خروج…" : "خروج از حساب"}</Button>{error && <Alert variant="destructive" className="mt-3"><AlertTitle>عملیات انجام نشد</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}</div>;
}

type SessionView = { id: string; createdAt: string; expiresAt: string; current: boolean; userAgent: string | null };
export function SessionControls() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/sessions", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      setSessions((await response.json()).sessions);
    }).catch((error) => { if (error.name !== "AbortError") setError("دریافت نشست‌ها انجام نشد. صفحه را دوباره باز کنید."); });
    return () => controller.abort();
  }, []);
  async function revokeAll() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/sessions", { method: "DELETE" });
      if (!response.ok) throw new Error();
      await authPost("/sign-out"); router.replace("/login"); router.refresh();
    } catch { setError("خروج از دستگاه‌ها انجام نشد. دوباره تلاش کنید."); setBusy(false); }
  }
  return <Card className="mb-6">
    <CardHeader><CardTitle role="heading" aria-level={2}>نشست‌های فعال</CardTitle><CardDescription>دستگاه‌های متصل به حساب خود را بررسی کنید.</CardDescription></CardHeader>
    <CardContent>
    {error && <Alert variant="destructive"><AlertTitle>مشکل در مدیریت نشست‌ها</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {!sessions ? !error && <p role="status">در حال دریافت نشست‌ها…</p> : <ul className="session-list">{sessions.map((session) => <li key={session.id}><div><strong>{session.current ? "این دستگاه" : "دستگاه دیگر"}</strong><p>{session.userAgent?.slice(0, 150) || "مرورگر ناشناخته"}</p></div><span>ورود: {new Date(session.createdAt).toLocaleDateString("fa-IR")}</span></li>)}</ul>}
    </CardContent>
    <CardFooter><Button variant="outline" disabled={busy || !sessions} onClick={revokeAll}>{busy ? "در حال خروج…" : "خروج از همه دستگاه‌ها"}</Button></CardFooter>
  </Card>;
}
