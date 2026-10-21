import {Suspense} from "react";
import {HomeRows} from "@/components/operations/public-content";
import {StoreWidgets} from "@/components/operations/widgets";
import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowUpLeftIcon, CircleIcon, Flower2Icon, HeartIcon, LeafIcon, SunIcon, ShieldCheckIcon, type LucideIcon } from "lucide-react";
import { defaultLocale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactDialog } from "./contact-dialog";
import { Reveal, ScrollScene } from "./motion";
import { IdeasCarousel } from "./ideas-carousel";
import { HoneyFaq } from "./honey-faq";
import { StoreHeader } from "@/components/storefront/store-navigation";
import { ExploreArrow } from "@/components/motion/explore-arrow";

const asset = "/images/vitaboost/";

function Label({ children }: { children: React.ReactNode }) {
  return <p className="vb-section-label"><CircleIcon aria-hidden="true" />{children}</p>;
}
function SectionHeader({ label, title, description, centered = false }: { label: string; title: string; description?: string; centered?: boolean }) {
  return <Reveal className={centered ? "vb-section-heading vb-heading-centered" : "vb-section-heading"}><Label>{label}</Label><h2>{title}</h2>{description && <p className="vb-section-description">{description}</p>}</Reveal>;
}
function BenefitCard({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return <Card size="sm" data-appearance="benefit"><CardHeader><CardTitle>{title}</CardTitle><CardAction><span className="vb-icon-tile"><Icon aria-hidden="true" /></span></CardAction></CardHeader><CardContent><CardDescription>{description}</CardDescription></CardContent></Card>;
}
function LifestylePhoto({ name, alt }: { name: string; alt: string }) {
  return <figure className={`vb-lifestyle vb-photo-${name}`}><Image src={`${asset}${name}.webp`} alt={alt} fill sizes="(max-width: 560px) 44vw, 25vw" /></figure>;
}
function ShopButton({ children }: { children: React.ReactNode }) {
  return <Button size="lg" className="t-learn" asChild><Link href="/products">{children}<ExploreArrow /></Link></Button>;
}

export async function VitaBoostLanding() {
  const t = await getTranslations({ locale: defaultLocale, namespace: "Landing" });
  const format = await getFormatter({ locale: defaultLocale });
  const ingredientIds = ["taste", "label", "table", "choice"] as const;
  const wayIds = ["breakfast", "drink", "recipe", "gift"] as const;
  const audienceIds = ["morning", "family", "cook", "simple"] as const;
  const showcase = [
    { id: "product", href: "/products", image: "dr-biz-honey.png", product: true },
    { id: "breakfast", href: "#categories", image: "honey-breakfast.webp", product: false },
    { id: "origin", href: "#ingredients", image: "apiary.webp", product: false },
  ] as const;
  return (
    <div className="vb-landing" dir="rtl" lang={defaultLocale}>
      <a className="vb-skip-link" href="#vb-main">{t("skip")}</a>
      <StoreHeader current="home" />
      <main id="vb-main">
        <section className="vb-hero" id="home" aria-labelledby="vb-title">
          <Image className="vb-meadow" src={`${asset}meadow.webp`} alt="" fill sizes="100vw" loading="eager" fetchPriority="high" />
          <Reveal className="vb-hero-title"><h1 id="vb-title">{t("hero.title")}</h1></Reveal>
          <div className="vb-hero-orbit"><Image className="vb-bottle" src={`${asset}dr-biz-honey.png`} alt={t("hero.imageAlt")} width={800} height={952} sizes="(max-width: 560px) 460px, 620px" loading="eager" /></div>
          <Link className="vb-featured-link" href="/products" aria-label={t("hero.productTitle")}><Card size="sm" data-appearance="featured"><CardContent><Image src={`${asset}dr-biz-honey.png`} alt="" width={800} height={952} sizes="100px" /></CardContent><CardHeader><CardTitle>{t("brand")}</CardTitle><CardDescription>{t("hero.productType")}</CardDescription></CardHeader><CardFooter><span>{t("hero.productLink")}</span><ArrowUpLeftIcon aria-hidden="true" /></CardFooter></Card></Link>
          <div className="vb-hero-copy"><Reveal><p>{t("hero.description")}</p><ShopButton>{t("hero.cta")}</ShopButton></Reveal></div>
        </section>

        <section className="vb-benefits" id="about" aria-labelledby="vb-benefits-heading">
          <div className="vb-benefits-intro"><Reveal className="vb-intro-copy"><Label>{t("intro.label")}</Label><h2 id="vb-benefits-heading">{t("intro.title")} <span>{t("intro.description")}</span></h2></Reveal><aside className="vb-community-stat"><strong>{t("intro.stat")}</strong><p>{t("intro.statDescription")}</p></aside></div>
          <div className="vb-bento"><Reveal className="vb-bento-top"><Card size="sm" data-appearance="wellness"><CardHeader><span className="vb-icon-tile"><HeartIcon aria-hidden="true" /></span><div className="vb-countries-stat"><strong>{t("bento.everyday")}</strong><CardDescription>{t("bento.everydayDescription")}</CardDescription></div></CardHeader><CardContent><CardTitle>{t("bento.simpleTitle")}</CardTitle><CardDescription>{t("bento.simpleDescription")}</CardDescription></CardContent></Card><LifestylePhoto name="honeycomb" alt={t("bento.honeycombAlt")} /><BenefitCard title={t("bento.goldTitle")} description={t("bento.goldDescription")} icon={ShieldCheckIcon} /></Reveal><Reveal className="vb-bento-bottom"><LifestylePhoto name="honey-breakfast" alt={t("bento.breakfastAlt")} /><BenefitCard title={t("bento.morningTitle")} description={t("bento.morningDescription")} icon={SunIcon} /><BenefitCard title={t("bento.natureTitle")} description={t("bento.natureDescription")} icon={Flower2Icon} /><LifestylePhoto name="apiary" alt={t("bento.apiaryAlt")} /></Reveal></div>
        </section>

        <section className="vb-ingredients vb-section" id="ingredients" aria-label={t("ingredients.title")}>
          <Image className="vb-ingredients-backdrop" src={`${asset}honey-valley.webp`} alt="" fill sizes="100vw" /><SectionHeader label={t("ingredients.label")} title={t("ingredients.title")} description={t("ingredients.description")} centered />
          <ScrollScene className="vb-ingredient-stage"><Image className="vb-ingredient-jar" src={`${asset}dr-biz-honey.png`} alt={t("hero.imageAlt")} width={800} height={952} sizes="(max-width: 560px) 400px, 600px" /><Image className="vb-comb vb-comb-one" src={`${asset}honeycomb-cutout.png`} alt="" width={220} height={220} /><Image className="vb-comb vb-comb-two" src={`${asset}honey-dipper-cutout.png`} alt="" width={160} height={160} /><Image className="vb-comb vb-comb-three" src={`${asset}bee-blossom-cutout.png`} alt="" width={130} height={130} /></ScrollScene>
          <Reveal className="vb-ingredient-features">{ingredientIds.map(id => <div key={id}><span className="vb-icon-tile"><LeafIcon aria-hidden="true" /></span><h3>{t(`ingredients.items.${id}.title`)}</h3><p>{t(`ingredients.items.${id}.description`)}</p></div>)}</Reveal>
        </section>

        <section className="vb-showcase vb-section" id="collection">
          <SectionHeader label={t("showcase.label")} title={t("showcase.title")} description={t("showcase.description")} />
          <Reveal className="vb-products-grid">{showcase.map(item => <Link href={item.href} key={item.id} className="vb-product-link"><Card><div className={item.product ? "vb-product-photo vb-product-isolated" : "vb-product-photo"}><Image src={`${asset}${item.image}`} alt={item.product ? t("hero.imageAlt") : t(item.id === "breakfast" ? "bento.breakfastAlt" : "bento.apiaryAlt")} fill sizes="(max-width: 640px) 90vw, 32vw" /><div className="vb-product-badge"><Badge>{t(`showcase.cards.${item.id}.badge`)}</Badge></div></div><CardHeader><CardTitle>{t(`showcase.cards.${item.id}.title`)}</CardTitle></CardHeader><CardContent><CardDescription>{t(`showcase.cards.${item.id}.description`)}</CardDescription></CardContent><CardFooter><span>{t(`showcase.cards.${item.id}.cta`)}</span><ArrowUpLeftIcon aria-hidden="true" /></CardFooter></Card></Link>)}</Reveal>
          <div className="vb-section-action"><ShopButton>{t("showcase.all")}</ShopButton></div>
        </section>

        <section className="vb-ritual vb-section"><picture><source media="(max-width: 560px)" srcSet={`${asset}honey-ritual-mobile.webp`} /><Image src={`${asset}honey-ritual.webp`} alt={t("ritual.imageAlt")} fill sizes="100vw" /></picture><Reveal className="vb-ritual-copy"><LeafIcon aria-hidden="true" /><h2>{t("ritual.title")}</h2><p>{t("ritual.description")}</p><ShopButton>{t("ritual.cta")}</ShopButton></Reveal></section>

        <section className="vb-ways vb-section" id="categories"><SectionHeader label={t("ways.label")} title={t("ways.title")} centered /><div className="vb-category-list">{wayIds.map((id,index) => <Reveal key={id}><Link href="#daily-ideas" className="vb-category-row"><span className="vb-row-number">{format.number(index+1,{minimumIntegerDigits:2})}</span><h3>{t(`ways.items.${id}.title`)}</h3><p>{t(`ways.items.${id}.description`)}</p><Image src={`${asset}honeycomb-cutout.png`} alt="" width={150} height={150} /><ArrowUpLeftIcon aria-hidden="true" /></Link><Separator /></Reveal>)}</div></section>

        <section className="vb-scenic-wrap vb-section" id="daily-ideas"><div className="vb-scenic"><Image src={`${asset}honey-valley.webp`} alt="" fill sizes="100vw" /><ScrollScene className="vb-scenic-visual"><Image src={`${asset}dr-biz-honey.png`} alt={t("hero.imageAlt")} width={800} height={952} sizes="(max-width: 560px) 380px, 600px" /></ScrollScene><Reveal className="vb-scenic-copy"><Label>{t("ideas.label")}</Label><h2>{t("scenic.title")}</h2><ShopButton>{t("scenic.cta")}</ShopButton></Reveal></div><IdeasCarousel /></section>

        <section className="vb-audience vb-section"><figure><Image src={`${asset}honey-breakfast.webp`} alt={t("bento.breakfastAlt")} fill sizes="(max-width: 640px) 90vw, 45vw" /></figure><div><SectionHeader label={t("audience.label")} title={t("audience.title")} description={t("audience.description")} /><Reveal className="vb-audience-list">{audienceIds.map((id,index) => <div className="vb-audience-row" key={id}><span>{format.number(index+1,{minimumIntegerDigits:2})}</span><h3>{t(`audience.items.${id}.title`)}</h3><p>{t(`audience.items.${id}.description`)}</p></div>)}</Reveal></div></section>

        <section className="vb-faq vb-section" id="faq"><div className="vb-faq-aside"><SectionHeader label={t("faq.label")} title={t("faq.title")} description={t("faq.description")} /><Card size="sm"><CardHeader><CardTitle>{t("faq.helpTitle")}</CardTitle><CardDescription>{t("faq.helpDescription")}</CardDescription></CardHeader><CardFooter><ContactDialog /></CardFooter></Card></div><HoneyFaq /></section>
        <Suspense fallback={null}><HomeRows/></Suspense>
      </main>
      <footer className="vb-footer" id="contact"><Image src={`${asset}honey-valley.webp`} alt="" fill sizes="100vw" /><div className="vb-footer-community"><div><Link href="/" className="vb-brand"><LeafIcon aria-hidden="true" />{t("brand")}</Link><p>{t("footer.label")}</p><div className="vb-footer-links"><Link href="/products">{t("footer.shop")}</Link><Link href="/account">{t("footer.account")}</Link><Link href="/faq">{t("faq.label")}</Link></div></div><Reveal><h2>{t("footer.title")}</h2><p>{t("footer.description")}</p><Button size="lg" asChild><Link href="/login">{t("footer.join")}<ArrowUpLeftIcon data-icon="inline-end" /></Link></Button></Reveal></div><div className="vb-footer-base"><nav aria-label={t("navLabel")}><Link href="#home">{t("nav.home")}</Link><Link href="/about">{t("nav.about")}</Link><Link href="/products">{t("nav.products")}</Link><Link href="/faq">{t("faq.label")}</Link></nav><p>{t("footer.rights")}</p><Separator /><div className="vb-footer-wordmark">{t("footer.wordmark")}</div></div></footer>
      <Suspense fallback={null}><StoreWidgets/></Suspense>
    </div>
  );
}
