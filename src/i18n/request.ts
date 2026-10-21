import { getRequestConfig } from "next-intl/server";
import messages from "../../messages/fa.json";
import { defaultLocale, timeZone } from "./config";

export default getRequestConfig(async () => ({
  locale: defaultLocale,
  messages,
  timeZone,
}));
