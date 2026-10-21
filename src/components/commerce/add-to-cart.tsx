"use client";
import { MotionNumber, SuccessCheck } from "./motion-number";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShoppingBagIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addCartLine } from "./cart-store";
export function AddToCart({ variantId, available }: { variantId: string; available: boolean }) {
  const t = useTranslations("Commerce"); const [quantity, setQuantity] = useState(1); const [added, setAdded] = useState(false); const [error, setError] = useState("");
  function add() { try { addCartLine(variantId, quantity); setAdded(true); setError(""); } catch (e) { setError(e instanceof Error ? e.message : t("saveError")); } }
  return <div className="commerce-add"><div className="commerce-buy-row"><div className="commerce-quantity" aria-label={t("quantity")}><Button variant="ghost" size="icon" aria-label={t("minus")} disabled={quantity <= 1 || !available} onClick={() => { setQuantity(q => q - 1); setAdded(false); }}><MinusIcon /></Button><output aria-live="polite"><MotionNumber value={quantity.toLocaleString("fa-IR")} /></output><Button variant="ghost" size="icon" aria-label={t("plus")} disabled={quantity >= 20 || !available} onClick={() => { setQuantity(q => q + 1); setAdded(false); }}><PlusIcon /></Button></div><Button size="lg" disabled={!available} onClick={add}><ShoppingBagIcon data-icon="inline-start" />{available ? t("add") : t("unavailable")}</Button></div>{added && <p className="commerce-added" role="status"><SuccessCheck />{t("added")} <Link href="/cart">{t("seeCart")}</Link></p>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
