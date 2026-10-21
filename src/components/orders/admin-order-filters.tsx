import {ShipmentFilter} from "@/components/operations/shipment-filter";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldContent } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function AdminOrderFilters({ values, canSearchPhone, canReadPayments, error }: { values: Record<string, string | string[] | undefined>; canSearchPhone: boolean; canReadPayments: boolean; error?: string }) {
  const t = useTranslations("AdminOrders");
  const value = (key: string) => typeof values[key] === "string" ? values[key] : "";
  return <Card><CardHeader><CardTitle>{t("filters.title")}</CardTitle><CardDescription>{t("filters.description")}</CardDescription></CardHeader><form method="get" action="/admin/orders"><CardContent>
    {error && <Alert variant="destructive" className="mb-6"><SlidersHorizontalIcon /><AlertTitle>{t("filters.error")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <FieldGroup className="grid md:grid-cols-2 xl:grid-cols-3"><Field className="col-span-full"><FieldLabel>وضعیت مرسوله</FieldLabel><ShipmentFilter initial={value("shipment")}/></Field>
      <Field><FieldLabel htmlFor="order-query">{t("filters.query")}</FieldLabel><Input id="order-query" name="q" defaultValue={value("q")} maxLength={50} placeholder={t("filters.queryPlaceholder")} /></Field>
      {canSearchPhone && <Field><FieldLabel htmlFor="order-phone">{t("filters.phone")}</FieldLabel><Input id="order-phone" name="phone" defaultValue={value("phone")} maxLength={32} inputMode="tel" dir="ltr" placeholder="09123456789" /><FieldDescription>{t("filters.phoneHint")}</FieldDescription></Field>}
      {canReadPayments && <Field orientation="horizontal"><Checkbox id="order-payment" name="payment" value="review" defaultChecked={value("payment") === "review"} /><FieldContent><FieldLabel htmlFor="order-payment">{t("filters.needsReview")}</FieldLabel><FieldDescription>{t("filters.payment")}</FieldDescription></FieldContent></Field>}
      <Field><FieldLabel htmlFor="order-from">{t("filters.from")}</FieldLabel><Input id="order-from" name="from" type="date" dir="ltr" defaultValue={value("from")} /><FieldDescription>{t("filters.dateHint")}</FieldDescription></Field>
      <Field><FieldLabel htmlFor="order-to">{t("filters.to")}</FieldLabel><Input id="order-to" name="to" type="date" dir="ltr" defaultValue={value("to")} /><FieldDescription>{t("filters.inclusiveEnd")}</FieldDescription></Field>
    </FieldGroup><Input type="hidden" name="status" value={value("status")} />
  </CardContent><CardFooter className="flex flex-wrap gap-3 pt-6"><Button type="submit"><SearchIcon data-icon="inline-start" />{t("filters.apply")}</Button><Button variant="ghost" asChild><Link href="/admin/orders">{t("filters.reset")}</Link></Button></CardFooter></form></Card>;
}
