import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { defaultLocale } from "@/i18n/config";
import { VitaBoostLanding } from "@/components/landing/vitaboost-landing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: defaultLocale, namespace: "Landing" });
  return { title: { absolute: t("metaTitle") }, description: t("metaDescription"), alternates: { canonical: "/" } };
}

export default function Home() { return <VitaBoostLanding />; }
