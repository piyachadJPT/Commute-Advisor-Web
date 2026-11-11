import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { completeOnboarding } from "@/features/onboarding/actions";
import { OnboardingShell } from "@/features/onboarding/ui/onboarding-shell";
import { getUserSettings } from "@/features/settings/data/settingsRepo";
import { CommuteForm } from "@/features/settings/ui/commute-form";
import { primaryButton, quietButton } from "@/features/settings/ui/styles";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          className="mx-auto mt-14 h-64 max-w-xl animate-pulse rounded-card glass"
        />
      }
    >
      <OnboardingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OnboardingContent({
  searchParams,
}: Pick<PageProps<"/onboarding">, "searchParams">) {
  const params = await searchParams;
  const n = Number(typeof params.step === "string" ? params.step : "1");
  const step = n === 2 || n === 3 ? n : 1;

  const user = await requireUser();
  const s = await getUserSettings(await createClient(), user.id);
  if (!s) throw new Error("No settings row for the signed-in user");
  if (s.onboardingCompleted) redirect("/"); // already done; settings has everything

  const t = await getTranslations("onboarding");

  if (step === 1) {
    const both = s.home.isSet && s.work.isSet;
    const ts = await getTranslations("settings.locations");
    return (
      <OnboardingShell step={1} title={t("locations.title")}>
        <p className="text-body text-ink-2">{t("locations.body")}</p>
        <ul className="mt-2 divide-y divide-divider">
          {(["home", "work"] as const).map((key) => {
            const place = s[key];
            return (
              <li key={key}>
                <Link
                  href={`/onboarding/location/${key}`}
                  className="flex min-h-14 items-center gap-3 py-2 transition-colors duration-(--duration-fast) hover:text-primary"
                >
                  <Icon
                    name={key === "home" ? "home" : "work"}
                    className="size-6 text-ink-3"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-medium">
                      {ts(key)}
                    </span>
                    <span className="block truncate text-caption text-ink-3">
                      {place.isSet
                        ? (place.name ?? ts("custom"))
                        : ts("notSet")}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-ink-3">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/onboarding?step=2"
          className={`${both ? primaryButton : quietButton} mt-4 w-full sm:w-auto`}
        >
          {both ? t("continue") : t("skipStep")}
        </Link>
      </OnboardingShell>
    );
  }

  if (step === 2) {
    return (
      <OnboardingShell step={2} title={t("commute.title")}>
        <p className="mb-4 text-body text-ink-2">{t("commute.body")}</p>
        <CommuteForm
          variant="onboarding"
          departureTime={s.departureTime}
          returnTime={s.returnTime}
          durationMinutes={s.durationMinutes}
          threshold={s.threshold}
          commuteDays={s.commuteDays}
        />
        <Link href="/onboarding?step=3" className={`${quietButton} mt-3`}>
          {t("skipStep")}
        </Link>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={3} title={t("notifications.title")}>
      <p className="text-body text-ink-2">
        {t("notifications.body", { time: s.notificationTime })}
      </p>
      <p className="mt-3 rounded-tile bg-fill-soft px-3.5 py-2.5 text-label font-medium">
        {t("notifications.example")}
      </p>
      <p className="mt-3 text-caption text-ink-3">
        {t("notifications.iphone")}
      </p>
      <p className="mt-3 text-caption text-ink-3">
        {t("notifications.unavailable")}
      </p>
      <form action={completeOnboarding} className="mt-4">
        <button type="submit" className={`${primaryButton} w-full sm:w-auto`}>
          {t("finish")}
        </button>
      </form>
    </OnboardingShell>
  );
}
