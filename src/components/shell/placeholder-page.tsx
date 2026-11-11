import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";

type Props = {
  section: "weather" | "history" | "settings";
  children?: ReactNode;
};

/** Suspense keeps the cookie-based locale read off the instant navigation path. */
export function PlaceholderPage(props: Props) {
  return (
    <Suspense fallback={<PlaceholderSkeleton />}>
      <PlaceholderContent {...props} />
    </Suspense>
  );
}

function PlaceholderSkeleton() {
  return (
    <div aria-busy="true" className="pt-6 lg:pt-8">
      <div className="h-10 w-40 animate-pulse rounded-tile bg-(--hero-chip-light)" />
      <div className="mt-4 h-32 animate-pulse rounded-card glass" />
    </div>
  );
}

async function PlaceholderContent({
  section,
  children,
}: {
  section: "weather" | "history" | "settings";
  children?: ReactNode;
}) {
  const nav = await getTranslations("nav");
  const t = await getTranslations("placeholder");
  return (
    <div className="pt-6 lg:pt-8">
      <h1 className="text-display font-bold tracking-[-0.02em] text-hero">
        {nav(section)}
      </h1>
      <section className="mt-4 max-w-2xl rounded-card p-[1.125rem] glass">
        <p className="text-body">{t(section)}</p>
        <p className="mt-1 text-caption text-ink-3">{t("comingIn")}</p>
        {children}
      </section>
    </div>
  );
}
