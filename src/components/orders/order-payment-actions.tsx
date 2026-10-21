"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { InfoIcon, RefreshCwIcon, ArrowUpLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { paymentDestination } from "@/modules/payments/destination";
import { requestCartSync } from "@/components/commerce/cart-store";

export function OrderPaymentActions({ orderId, canContinue, configured }: { orderId: string; canContinue: boolean; configured: boolean }) {
  const t = useTranslations("PaymentRecovery");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<"verified" | "failed" | "review" | null>(null);
  async function recover(action: "check" | "continue") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/account/orders/${encodeURIComponent(orderId)}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? t("error"));
      if (data.status === "continue") { location.assign(paymentDestination(data.redirectUrl)); return; }
      if (!["verified", "failed", "review"].includes(data.status)) throw new Error(t("error"));
      setResult(data.status); if(data.status === "verified")requestCartSync(); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t("error")); }
    finally { setBusy(false); }
  }
  return <Card className="mb-6"><CardHeader><CardTitle>{t("title")}</CardTitle><CardDescription>{t("description")}</CardDescription></CardHeader><CardContent><p>{configured ? t("sameAttempt") : t("unconfigured")}</p>{error && <Alert variant="destructive" className="mt-4"><InfoIcon /><AlertTitle>{t("errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}{result && <Alert role="status" className="mt-4"><InfoIcon /><AlertTitle>{t(`results.${result}.title`)}</AlertTitle><AlertDescription>{t(`results.${result}.body`)}</AlertDescription></Alert>}</CardContent><CardFooter className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy || !configured} onClick={() => recover("check")}><RefreshCwIcon data-icon="inline-start" />{busy ? t("checking") : t("check")}</Button>{canContinue && !result && <Button disabled={busy || !configured} onClick={() => recover("continue")}>{t("continue")}<ArrowUpLeftIcon data-icon="inline-end" /></Button>}</CardFooter></Card>;
}
