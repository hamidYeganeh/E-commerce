import { getTranslations } from "next-intl/server";
import { defaultLocale } from "@/i18n/config";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export async function HoneyFaq() {
  const t = await getTranslations({ locale: defaultLocale, namespace: "Landing.faq" });
  return (
    <Accordion type="single" collapsible defaultValue="details" className="vb-faq-list" dir="rtl">
      {(["details", "account", "browse", "collection"] as const).map(id => (
        <AccordionItem value={id} key={id}>
          <AccordionTrigger>{t(`items.${id}.question`)}</AccordionTrigger>
          <AccordionContent>{t(`items.${id}.answer`)}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
