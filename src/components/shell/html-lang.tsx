"use client";

import { useEffect } from "react";

/** Keeps <html lang> in sync with the streamed locale (the static shell defaults to "th"). */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
