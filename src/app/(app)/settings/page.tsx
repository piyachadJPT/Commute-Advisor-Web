import { getLocale, getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { setLocale } from "@/i18n/actions";
import { locales } from "@/i18n/config";

export default function SettingsPage() {
  return (
    <PlaceholderPage section="settings">
      <LanguageForm />
    </PlaceholderPage>
  );
}

async function LanguageForm() {
  const t = await getTranslations("settings");
  const current = await getLocale();
  const labels = { th: t("languageTh"), en: t("languageEn") } as const;

  return (
    <form action={setLocale} className="mt-6 border-t border-divider pt-4">
      <fieldset>
        <legend className="text-label font-medium text-ink-3">
          {t("language")}
        </legend>
        <div className="mt-2 inline-flex rounded-control bg-fill-soft p-1">
          {locales.map((locale) => (
            <button
              key={locale}
              type="submit"
              name="locale"
              value={locale}
              aria-pressed={current === locale}
              className="min-h-11 min-w-24 rounded-chip px-4 text-label font-medium text-ink-3 transition-colors hover:text-ink aria-pressed:bg-primary aria-pressed:text-primary-ink"
            >
              {labels[locale]}
            </button>
          ))}
        </div>
      </fieldset>
    </form>
  );
}
