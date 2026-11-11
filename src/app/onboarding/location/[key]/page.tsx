import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getUserSettings } from "@/features/settings/data/settingsRepo";
import { LocationPicker } from "@/features/settings/ui/location-picker";
import { quietButton } from "@/features/settings/ui/styles";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default function OnboardingLocationPage({
  params,
}: PageProps<"/onboarding/location/[key]">) {
  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          className="mx-auto mt-14 h-64 max-w-xl animate-pulse rounded-card glass"
        />
      }
    >
      <Content params={params} />
    </Suspense>
  );
}

async function Content({
  params,
}: Pick<PageProps<"/onboarding/location/[key]">, "params">) {
  const { key } = await params;
  if (key !== "home" && key !== "work") notFound();

  const [t, user] = await Promise.all([
    getTranslations("settings.location"),
    requireUser(),
  ]);
  const s = await getUserSettings(await createClient(), user.id);
  const place = key === "home" ? s?.home : s?.work;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6 lg:py-14">
      <Link
        href="/onboarding?step=1"
        className={`${quietButton} -ml-2 text-hero`}
      >
        {t("back")}
      </Link>
      <h1 className="mt-2 text-headline font-bold tracking-[-0.01em] text-hero">
        {t(`title.${key}`)}
      </h1>
      <section className="mt-4 rounded-card p-[1.125rem] glass">
        <LocationPicker
          locationKey={key}
          initialName={place?.name ?? ""}
          returnTo="onboarding"
        />
      </section>
    </div>
  );
}
