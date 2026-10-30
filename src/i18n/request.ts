import { getRequestConfig } from "next-intl/server";

/** Single locale for now (Hindi later): no locale routing, messages from /messages. */
export const DEFAULT_LOCALE = "en";

export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  timeZone: "Asia/Kolkata",
  messages: (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default,
}));
