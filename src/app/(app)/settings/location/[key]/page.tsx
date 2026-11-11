import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getUserSettings } from "@/features/settings/data/settingsRepo";
import { LocationPicker } from "@/features/settings/ui/location-picker";
import { card, quietButton } from "@/features/settings/ui/styles";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default function LocationPage({
  params,
}: PageProps<"/settings/location/[key]">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="pt-6 lg:pt-8">
          <div className="h-10 w-56 animate-pulse rounded-tile bg-(--hero-chip-light)" />
          <div className="mt-4 h-64 max-w-2xl animate-pulse rounded-card glass" />
        </div>
      }
    >
      <LocationContent params={params} />
    </Suspense>
  );
}

async function LocationContent({
  params,
}: Pick<PageProps<"/settings/location/[key]">, "params">) {
  const { key } = await params;
  if (key !== "home" && key !== "work") notFound();

  const [t, user] = await Promise.all([
    getTranslations("settings.location"),
    requireUser(),
  ]);
  const settings = await getUserSettings(await createClient(), user.id);
  const place = key === "home" ? settings?.home : settings?.work;

  return (
    <div className="pt-6 lg:pt-8">
      <Link href="/settings" className={`${quietButton} -ml-2`}>
        {t("back")}
      </Link>
      <h1 className="mt-2 text-display font-bold tracking-[-0.02em] text-hero">
        {t(`title.${key}`)}
      </h1>
      <section className={`${card} mt-4 max-w-2xl`}>
        <LocationPicker locationKey={key} initialName={place?.name ?? ""} />
      </section>
    </div>
  );
}
