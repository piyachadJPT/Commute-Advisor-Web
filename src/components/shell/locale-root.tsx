import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { HtmlLang } from "./html-lang";

export async function LocaleRoot({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <NextIntlClientProvider>
      <HtmlLang locale={locale} />
      <div lang={locale} className="contents">
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
