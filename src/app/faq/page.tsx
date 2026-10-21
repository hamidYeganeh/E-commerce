import {Suspense} from "react";
import { InformationPage, informationMetadata } from "@/components/storefront/information-page";

export async function generateMetadata() { return informationMetadata("faq"); }
export default function Page() { return <Suspense fallback={<p>در حال دریافت صفحه…</p>}><InformationPage kind="faq" /></Suspense>; }
