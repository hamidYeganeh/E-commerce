"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";

const ideas = ["toast", "yogurt", "table"] as const;
const images = ["honey-breakfast", "honeycomb", "apiary"];

export function IdeasCarousel() {
  const t = useTranslations("Landing.ideas");
  const format = useFormatter();
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const move = (direction: number) => {
    if (busy.current) return;
    const next = (index + direction + ideas.length) % ideas.length;
    const node = ref.current;
    if (!node || matchMedia("(prefers-reduced-motion: reduce)").matches) { setIndex(next); return; }
    busy.current = true;
    const duration = parseFloat(getComputedStyle(node).getPropertyValue("--text-swap-dur")) || 150;
    node.classList.add("is-exit");
    timer.current = setTimeout(() => {
      flushSync(() => setIndex(next));
      node.classList.remove("is-exit");
      node.classList.add("is-enter-start");
      void node.offsetHeight;
      node.classList.remove("is-enter-start");
      busy.current = false;
    }, duration);
  };
  return (
    <section className="vb-ideas" aria-label={t("label")} aria-roledescription="carousel">
      <div ref={ref} className="vb-ideas-grid t-text-swap" aria-live="polite">
        {[index, (index + 1) % ideas.length].map((item, position) => (
          <Card key={ideas[item]} className={position === 1 ? "vb-idea-secondary" : undefined}>
            <CardHeader><span className="vb-idea-number" aria-label={t("slideLabel", { current: format.number(item + 1), total: format.number(ideas.length) })}>{format.number(item + 1, { minimumIntegerDigits: 2 })}<small> / {format.number(ideas.length, { minimumIntegerDigits: 2 })}</small></span><CardTitle>{t(`items.${ideas[item]}.title`)}</CardTitle></CardHeader>
            <CardContent><CardDescription>{t(`items.${ideas[item]}.description`)}</CardDescription></CardContent>
            <CardFooter><Image src={`/images/vitaboost/${images[item]}.webp`} alt="" width={72} height={72} /><span>{t(`items.${ideas[item]}.tag`)}</span></CardFooter>
          </Card>
        ))}
      </div>
      <div className="vb-carousel-controls">
        <Button variant="outline" size="icon" aria-label={t("previous")} onClick={() => move(-1)}><ArrowRightIcon data-icon="inline-start" /></Button>
        <Button size="icon" aria-label={t("next")} onClick={() => move(1)}><ArrowLeftIcon data-icon="inline-end" /></Button>
      </div>
    </section>
  );
}
