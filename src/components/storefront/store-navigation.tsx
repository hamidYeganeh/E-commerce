import {StoreWidgets} from "@/components/operations/widgets";
import Link from "next/link";
import Image from "next/image";
import {Suspense} from "react";
import {connection} from "next/server";
import {LeafIcon} from "lucide-react";
import {getTranslations} from "next-intl/server";
import {defaultLocale} from "@/i18n/config";
import {CartLink} from "@/components/commerce/cart-link";
import {Button} from "@/components/ui/button";
import {publicSettings} from "@/modules/operations/records";
import {publicUrl} from "@/modules/operations/contracts";
import {getDatabase} from "@/infrastructure/database/server";
export function StoreHeader({current}:{current?:string}){return <Suspense fallback={<header className="vb-header"><Link href="/">دکتر بیز</Link><Link href="/products">محصولات</Link></header>}><Header current={current}/></Suspense>;}
async function settings(){await connection();try{return await publicSettings(getDatabase());}catch{return null;}}
async function Header({current}:{current?:string}){
 const t=await getTranslations({locale:defaultLocale,namespace:"StorePages"}),s=await settings();
 const custom=s?.menuLinks.split("\n").flatMap(line=>{const [title,href,...rest]=line.split("|").map(v=>v.trim());return title&&href&&!rest.length&&publicUrl.safeParse(href).success?[{title,href}]:[];}).slice(0,8);
 return <header className="vb-header"><Link className="vb-brand" href="/">{s?.logoUrl?<Image unoptimized src={s.logoUrl} width={40} height={40} alt=""/>:<LeafIcon aria-hidden="true"/>}<span>{s?.brandName||t("brand")}</span></Link><nav aria-label={t("navigation")}>{custom?.length?custom.map(l=><Link href={l.href} key={l.href}>{l.title}</Link>):<>{(["home","about","products","faq"] as const).map(id=><Link key={id} href={id==="home"?"/":`/${id}`} aria-current={current===id?"page":undefined}>{t(`nav.${id}`)}</Link>)}<Link href="/blog" aria-current={current==="blog"?"page":undefined}>مجله</Link></>}</nav><div className="vb-contact commerce-header-actions"><CartLink/><Button asChild><Link href="/contact">{t("nav.contact")}</Link></Button></div></header>;
}
export function StoreFooter({widgets=true}:{widgets?:boolean}={}){return <Suspense fallback={null}><Footer/>{widgets&&<StoreWidgets/>}</Suspense>;}
async function Footer(){const t=await getTranslations({locale:defaultLocale,namespace:"StorePages"}),s=await settings();return <footer className="info-footer"><Link className="vb-brand" href="/"><LeafIcon aria-hidden="true"/>{s?.brandName||t("brand")}</Link><p>{s?.footerText||t("footer")}</p>{s?.phone&&<a href={`tel:${s.phone}`} dir="ltr">{s.phone}</a>}{s?.address&&<p>{s.address}</p>}<nav aria-label={t("navigation")}>{(["about","products","faq","contact"] as const).map(id=><Link key={id} href={`/${id}`}>{t(`nav.${id}`)}</Link>)}<Link href="/blog">مجله</Link><Link href="/account">{t("account")}</Link>{s&&(["instagram","telegram","whatsapp"] as const).map(id=>s[id]?<a href={s[id]} key={id} rel="noreferrer">{id}</a>:null)}</nav></footer>;}
