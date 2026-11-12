import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { card, cardTitle, quietButton } from "@/features/settings/ui/styles";
import { defaultLocale, isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatStamp } from "@/lib/time/format";

const STALE_AFTER_MS = 60 * 60_000; // plan §13.5: no successful tick for more than 1 hour

export default function AboutPage() {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="pt-6 lg:pt-8">
          <div className="h-10 w-40 animate-pulse rounded-tile bg-(--hero-chip-light)" />
          <div className="mt-4 h-40 max-w-2xl animate-pulse rounded-card glass" />
        </div>
      }
    >
      <AboutContent />
    </Suspense>
  );
}

async function AboutContent() {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : defaultLocale;
  const [t, user] = await Promise.all([
    getTranslations("settings.about"),
    requireUser(),
  ]);
  void user; // the page is for signed-in users; the health function also checks auth.uid()

  // Last successful scheduler tick, from a SECURITY DEFINER function that returns only that.
  const { data: lastTick } = await (
    await createClient()
  ).rpc("get_scheduler_health");
  const last = lastTick ? new Date(lastTick) : null;
  const now = new Date();
  const down = last !== null && now.getTime() - last.getTime() > STALE_AFTER_MS;

  return (
    <div className="pt-6 lg:pt-8">
      <Link href="/settings" className={`${quietButton} -ml-2`}>
        {t("back")}
      </Link>
      <h1 className="mt-2 text-display font-bold tracking-[-0.02em] text-hero">
        {t("title")}
      </h1>

      <section
        aria-labelledby="health-title"
        className={`${card} mt-4 max-w-2xl`}
      >
        <h2 id="health-title" className={cardTitle}>
          {t("health.title")}
        </h2>
        <p
          role="status"
          className={`mt-2 flex items-start gap-2 text-body ${down ? "rounded-tile bg-warn-surface px-3 py-2 font-medium text-warn-ink" : ""}`}
        >
          {down ? (
            <Icon name="warning" className="mt-0.5 size-5 shrink-0" />
          ) : null}
          <span className="tabular">
            {last === null
              ? t("health.never")
              : down
                ? t("health.down", { time: formatStamp(last, locale) })
                : t("health.ok", { time: formatStamp(last, locale) })}
          </span>
        </p>
        <p className="mt-2 text-caption text-ink-3">{t("health.note")}</p>
      </section>

      <section
        aria-labelledby="credit-title"
        className={`${card} mt-4 max-w-2xl`}
      >
        <h2 id="credit-title" className={cardTitle}>
          {t("credit.title")}
        </h2>
        <p className="mt-2 text-body">
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary underline underline-offset-4"
          >
            {t("credit.link")}
          </a>
        </p>
        <p className="mt-1 text-caption text-ink-3">
          {t("credit.license")}{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            CC BY 4.0
          </a>
        </p>
        <p className="mt-3 text-caption text-ink-3">
          <a
            href="https://open-meteo.com/en/docs/air-quality-api"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            {t("credit.air")}
          </a>
        </p>
      </section>
    </div>
  );
}
