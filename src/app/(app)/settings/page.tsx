import { getLocale, getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { signOut } from "@/features/auth/actions";
import { setLocale } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import { getUser } from "@/lib/auth/session";

export default function SettingsPage() {
  return (
    <PlaceholderPage section="settings">
      <LanguageForm />
      <AccountSection />
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
        <div className="mt-2 inline-flex rounded-control bg-fill-soft p-[3px]">
          {locales.map((locale) => (
            <button
              key={locale}
              type="submit"
              name="locale"
              value={locale}
              aria-pressed={current === locale}
              className="min-h-11 min-w-24 rounded-[9px] px-4 text-label font-semibold text-ink-3 transition-colors duration-(--duration-fast) hover:text-ink aria-pressed:bg-glass-strong aria-pressed:text-ink aria-pressed:shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
            >
              {labels[locale]}
            </button>
          ))}
        </div>
      </fieldset>
    </form>
  );
}

async function AccountSection() {
  const t = await getTranslations("settings.account");
  const user = await getUser();

  return (
    <section
      aria-labelledby="account-title"
      className="mt-6 border-t border-divider pt-4"
    >
      <h2 id="account-title" className="text-label font-medium text-ink-3">
        {t("title")}
      </h2>
      {user?.email ? (
        <p className="mt-1 text-label break-all">
          {t("signedInAs", { email: user.email })}
        </p>
      ) : null}
      <form action={signOut} className="mt-3">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-control border border-divider px-4 text-label font-semibold text-primary transition-colors duration-(--duration-fast) hover:bg-fill-soft"
        >
          {t("signOut")}
        </button>
      </form>
    </section>
  );
}
