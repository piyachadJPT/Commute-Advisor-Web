import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { completeOnboarding } from "../actions";

/** Frame shared by the three steps: progress, the step's content, and "Skip setup". */
export async function OnboardingShell({
  step,
  title,
  children,
}: {
  step: 1 | 2 | 3;
  title: string;
  children: ReactNode;
}) {
  const t = await getTranslations("onboarding");
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6 lg:py-14">
      <p className="text-caption font-medium text-hero-2 tabular">
        {t("progress", { step, total: 3 })}
      </p>
      <div aria-hidden="true" className="mt-2 flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1 flex-1 rounded-full ${n <= step ? "bg-(--hero-chip-light)" : "bg-(--hero-chip)"}`}
          />
        ))}
      </div>
      <h1 className="mt-5 text-headline font-bold tracking-[-0.01em] text-hero">
        {title}
      </h1>
      <section className="mt-4 rounded-card p-[1.125rem] glass">
        {children}
      </section>
      <form action={completeOnboarding} className="mt-4">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-control px-2 text-label font-semibold text-hero underline-offset-4 hover:underline"
        >
          {t("skipAll")}
        </button>
      </form>
    </div>
  );
}
