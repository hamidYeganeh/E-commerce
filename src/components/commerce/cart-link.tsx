"use client";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import { useCart } from "./cart-store";
export function CartLink() { const { lines } = useCart(); const t = useTranslations("Commerce"); const f = useFormatter(); const count = lines.reduce((sum, l) => sum + l.quantity, 0); return <Link className="commerce-cart-link" href="/cart" aria-label={t("cartLabel", { count: f.number(count) })}><ShoppingBagIcon aria-hidden="true" /><span>{t("cart")}</span><span className="t-badge" data-open={count > 0}><Badge className="t-badge-dot commerce-cart-count">{f.number(count)}</Badge></span></Link>; }
