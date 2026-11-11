import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { signOut } from "@/features/auth/actions";
import { getUserSettings } from "@/features/settings/data/settingsRepo";
import { CommuteForm } from "@/features/settings/ui/commute-form";
import { card, cardTitle, quietButton } from "@/features/settings/ui/styles";
import { setLocale } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsSkeleton() {
  return (
    <div aria-busy="true" className="pt-6 lg:pt-8">
      <div className="h-10 w-40 animate-pulse rounded-tile bg-(--hero-chip-light)" />
      <div className="mt-4 h-40 animate-pulse rounded-card glass" />
    </div>
  );
}

async function SettingsContent() {
  const [nav, t, user] = await Promise.all([
    getTranslations("nav"),
    getTranslations("settings"),
    requireUser(),
  ]);
  const settings = await getUserSettings(await createClient(), user.id);
  if (!settings) throw new Error("No settings row for the signed-in user");

  const places = [
    { key: "home", value: settings.home },
    { key: "work", value: settings.work },
  ] as const;

  return (
    <div className="pt-6 lg:pt-8">
      <h1 className="text-display font-bold tracking-[-0.02em] text-hero">
        {nav("settings")}
      </h1>

      <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <section aria-labelledby="locations-title" className={card}>
            <h2 id="locations-title" className={cardTitle}>
              {t("locations.title")}
            </h2>
            <ul className="mt-2 divide-y divide-divider">
              {places.map(({ key, value }) => (
                <li key={key}>
                  <Link
                    href={`/settings/location/${key}`}
                    className="flex min-h-14 items-center gap-3 py-2 transition-colors duration-(--duration-fast) hover:text-primary"
                  >
                    <Icon
                      name={key === "home" ? "home" : "work"}
                      className="size-6 text-ink-3"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-medium">
                        {t(`locations.${key}`)}
                      </span>
                      <span className="block truncate text-caption text-ink-3">
                        {value.isSet
                          ? (value.name ?? t("locations.custom"))
                          : t("locations.notSet")}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-ink-3">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <LanguageSection />
          <AccountSection email={user.email} />
        </div>

        <CommuteForm
          departureTime={settings.departureTime}
          returnTime={settings.returnTime}
          durationMinutes={settings.durationMinutes}
          threshold={settings.threshold}
          commuteDays={settings.commuteDays}
        />
      </div>
    </div>
  );
}

async function LanguageSection() {
  const t = await getTranslations("settings");
  const current = await getLocale();
  const labels = { th: t("languageTh"), en: t("languageEn") } as const;

  return (
    <form action={setLocale} className={card}>
      <fieldset>
        <legend className={cardTitle}>{t("language")}</legend>
        <div className="mt-3 inline-flex rounded-control bg-fill-soft p-[3px]">
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

async function AccountSection({ email }: { email: string | null }) {
  const t = await getTranslations("settings.account");
  return (
    <section aria-labelledby="account-title" className={card}>
      <h2 id="account-title" className={cardTitle}>
        {t("title")}
      </h2>
      {email ? (
        <p className="mt-1 text-label break-all">
          {t("signedInAs", { email })}
        </p>
      ) : null}
      <form action={signOut} className="mt-3">
        <button type="submit" className={quietButton}>
          {t("signOut")}
        </button>
      </form>
    </section>
  );
}
