import { useTranslations } from "next-intl";
import Image from "next/image";
import { Flower2Icon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExploreArrow } from "@/components/motion/explore-arrow";
import { Reveal } from "@/components/landing/motion";

export function EditorialBanner({ label, title, description, compact = false }: { label: string; title: string; description?: string; compact?: boolean }) {
  const t = useTranslations("ShopDesign");
  return <section className={`editorial-banner${compact ? " editorial-banner--compact" : ""}`}>
    <Image src="/images/vitaboost/honey-collection-banner-v2.webp" alt="" fill sizes="(max-width: 700px) 100vw, 90vw" loading="eager" />
    <Reveal className="editorial-banner-copy"><Badge variant="outline"><Flower2Icon data-icon="inline-start" />{label}</Badge><h1>{title}</h1>{description && <p>{description}</p>}</Reveal>
    <span className="editorial-banner-caption" aria-hidden="true">{t("bannerCaption")}</span>
  </section>;
}

export function BreakfastStory() {
  const t = useTranslations("ShopDesign");
  return <Reveal className="breakfast-story"><div className="breakfast-story-photo"><Image src="/images/vitaboost/honey-breakfast-editorial-v2.webp" alt={t("breakfastAlt")} fill sizes="(max-width: 700px) 90vw, 45vw" /></div><div className="breakfast-story-copy"><span className="eyebrow">{t("storyLabel")}</span><h2>{t("breakfastTitle")}</h2><p>{t("breakfastDescription")}</p><Button variant="outline" className="t-learn" asChild><Link href="/products">{t("explore")}<ExploreArrow /></Link></Button></div></Reveal>;
}
