import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  defaultLocale,
  isLocale,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
} from "./config";

// Locale order (plan §10.1): settings.locale (Phase 2) → cookie → Accept-Language → default.
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : (localeFromAcceptLanguage((await headers()).get("accept-language")) ??
      defaultLocale);

  return {
    locale,
    timeZone: "Asia/Bangkok",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
