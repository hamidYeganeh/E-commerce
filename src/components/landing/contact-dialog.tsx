"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ContactDialog() {
  const t = useTranslations("Landing");
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="lg">{t("nav.contact")}</Button></DialogTrigger>
      <DialogContent className="vb-dialog" closeLabel={t("contact.close")} dir="rtl" lang="fa">
        <DialogHeader><DialogTitle>{t("contact.title")}</DialogTitle><DialogDescription>{t("contact.description")}</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" asChild><Link href="/account">{t("contact.account")}</Link></Button>
          <Button asChild><Link href="/products">{t("contact.products")}</Link></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
