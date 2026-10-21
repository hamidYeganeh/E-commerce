import messages from "../../messages/fa.json";
import { defaultLocale } from "./config";

declare module "next-intl" {
  interface AppConfig {
    Locale: typeof defaultLocale;
    Messages: typeof messages;
  }
}
