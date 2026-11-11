import { getTranslations } from "next-intl/server";
import Link from "next/link";

/** Shown when there is nothing to analyse yet (plan §11.2, "No locations yet"). */
export async function NeedsSetup({ reason }: { reason: "locations" | "days" }) {
  const t = await getTranslations(`dashboard.setup.${reason}`);
  return (
    <section className="mt-6 max-w-xl rounded-card p-[1.125rem] glass">
      <h1 className="text-headline font-semibold">{t("title")}</h1>
      <p className="mt-1 text-body text-ink-2">{t("body")}</p>
      <Link
        href="/settings"
        className="mt-4 inline-flex min-h-12 items-center rounded-control bg-primary px-5 text-body font-semibold text-primary-ink transition-opacity duration-(--duration-fast) hover:opacity-90"
      >
        {t("cta")}
      </Link>
    </section>
  );
}
