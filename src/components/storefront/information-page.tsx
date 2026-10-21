import {Suspense} from "react";
import {connection} from "next/server";
import {getDatabase} from "@/infrastructure/database/server";
import {editablePage} from "@/modules/operations/pages";
import {StoreShell} from "./store-shell";
import {EditablePage} from "@/components/operations/public-content";
import { EditorialBanner, BreakfastStory } from "./editorial-banner";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpLeftIcon, EyeIcon, Flower2Icon, SearchIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { defaultLocale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Reveal } from "@/components/landing/motion";
import { HoneyFaq } from "@/components/landing/honey-faq";
import { StoreFooter, StoreHeader } from "./store-navigation";

export type InformationPageKind = "about" | "contact" | "faq";

export async function informationMetadata(kind: InformationPageKind) {
  const t = await getTranslations({ locale: defaultLocale, namespace: "StorePages" });
  await connection();let page:Awaited<ReturnType<typeof editablePage>>=null;try{page=await editablePage(getDatabase(),kind);}catch{}
  return { title: page?.seoTitle||page?.title||t(`nav.${kind}`), description: page?.seoDescription||t(`${kind}.description`), alternates: { canonical: `/${kind}` } };
}

export async function InformationPage({ kind }: { kind: InformationPageKind }) {
  await connection();let page:Awaited<ReturnType<typeof editablePage>>=null;try{page=await editablePage(getDatabase(),kind);}catch{}
  if(page)return <StoreShell current={kind}><EditablePage slug={kind}/></StoreShell>;
  const t = await getTranslations({ locale: defaultLocale, namespace: "StorePages" });
  return <div className="vb-landing info-page"><a className="vb-skip-link" href="#info-main">{t("skip")}</a><StoreHeader current={kind} /><main id="info-main">
    <EditorialBanner label={t(`${kind}.label`)} title={t(`${kind}.title`)} description={t(`${kind}.description`)} />
    {kind === "about" && <><section className="info-story"><div className="info-story-photo"><Image src="/images/vitaboost/apiary.webp" alt={t("about.imageAlt")} fill sizes="(max-width: 700px) 90vw, 45vw" /></div><Reveal className="info-story-copy"><p className="vb-section-label">{t("brand")}</p><h2>{t("about.heading")}</h2><p>{t("about.body")}</p><p>{t("about.second")}</p><Button size="lg" asChild><Link href="/products">{t("shop")}<ArrowUpLeftIcon data-icon="inline-end" /></Link></Button></Reveal></section><Reveal className="info-values">{(["clarity", "choice", "everyday"] as const).map((id, index) => { const Icon = [EyeIcon, SearchIcon, Flower2Icon][index]; return <Card key={id}><CardHeader><span className="vb-icon-tile"><Icon aria-hidden="true" /></span><CardTitle>{t(`about.values.${id}.title`)}</CardTitle></CardHeader><CardContent><CardDescription>{t(`about.values.${id}.body`)}</CardDescription></CardContent></Card>; })}</Reveal></>}
    {kind === "contact" && <><section className="info-contact-photo"><Image src="/images/vitaboost/honeycomb.webp" alt={t("contact.imageAlt")} fill sizes="90vw" /></section><Reveal className="info-values info-contact-cards">{(["products", "account", "faq"] as const).map(id => <Card key={id}><CardHeader><CardTitle>{t(`contact.cards.${id}.title`)}</CardTitle></CardHeader><CardContent><CardDescription>{t(`contact.cards.${id}.body`)}</CardDescription></CardContent><CardFooter><Button variant="outline" asChild><Link href={id === "account" ? "/login" : `/${id}`}>{t(`contact.cards.${id}.cta`)}<ArrowUpLeftIcon data-icon="inline-end" /></Link></Button></CardFooter></Card>)}</Reveal><p className="info-contact-note">{t("contact.note")}</p></>}
    {kind === "faq" && <section className="info-faq"><HoneyFaq /><aside><Image src="/images/vitaboost/honeycomb.webp" alt="" width={400} height={400} /><h2>{t("faq.asideTitle")}</h2><p>{t("faq.asideBody")}</p><Button asChild><Link href="/contact">{t("faq.cta")}<ArrowUpLeftIcon data-icon="inline-end" /></Link></Button></aside></section>}
  <Suspense fallback={null}><EditablePage slug={kind}/></Suspense><BreakfastStory /></main><StoreFooter /></div>;
}
