import { useTranslations } from "next-intl";
import { CircleAlertIcon, CreditCardIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { priceToman } from "@/components/catalog/format";
import type { AdminOrder } from "@/modules/orders/admin-read";
export function AdminOrderPayments({ payments }: { payments: NonNullable<AdminOrder["payments"]> }) {
  const t = useTranslations("AdminOrders.payments");
  const date = (value: Date) => value.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" });
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCardIcon aria-hidden="true" />{t("title")}</CardTitle><CardDescription>{t("description")}</CardDescription></CardHeader><CardContent>
    {payments.length ? <div className="table-scroll"><Table className="min-w-[680px]"><TableHeader><TableRow><TableHead>{t("provider")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("amount")}</TableHead><TableHead>{t("reference")}</TableHead><TableHead>{t("dates")}</TableHead></TableRow></TableHeader><TableBody>{payments.map(p => <TableRow key={p.id}><TableCell>{t(`providers.${p.provider}`)}</TableCell><TableCell><Badge variant={p.status === "FAILED" ? "destructive" : "secondary"}>{t(`statuses.${p.status}`)}</Badge>{p.reason && <p className="mt-2 text-muted-foreground">{t(`reasons.${p.reason}`)}</p>}</TableCell><TableCell>{priceToman(p.amountRial)}</TableCell><TableCell><bdi>{p.transactionId ?? "—"}</bdi></TableCell><TableCell><p>{t("created")}: <time dateTime={p.createdAt.toISOString()}>{date(p.createdAt)}</time></p><p>{t("updated")}: <time dateTime={p.updatedAt.toISOString()}>{date(p.updatedAt)}</time></p>{p.verifiedAt && <p>{t("verified")}: <time dateTime={p.verifiedAt.toISOString()}>{date(p.verifiedAt)}</time></p>}</TableCell></TableRow>)}</TableBody></Table></div> : <Empty><EmptyHeader><EmptyTitle>{t("emptyTitle")}</EmptyTitle><EmptyDescription>{t("emptyDescription")}</EmptyDescription></EmptyHeader></Empty>}
  </CardContent><CardFooter><Alert><CircleAlertIcon /><AlertTitle>{t("readOnlyTitle")}</AlertTitle><AlertDescription>{t("readOnly")}</AlertDescription></Alert></CardFooter></Card>;
}
