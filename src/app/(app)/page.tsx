import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/shell/shell-skeleton";
import { loadDashboard } from "@/features/dashboard/data/loadDashboard";
import { DashboardView } from "@/features/dashboard/ui/dashboard-view";
import { NeedsSetup } from "@/features/dashboard/ui/needs-setup";
import { defaultLocale, isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : defaultLocale;
  const [t, user] = await Promise.all([
    getTranslations("dashboard.place"),
    requireUser(),
  ]);

  const now = new Date();
  const data = await loadDashboard({
    supabase: await createClient(),
    userId: user.id,
    now,
    names: { home: t("home"), work: t("work") },
  });

  if (data.kind === "needs-locations") return <NeedsSetup reason="locations" />;
  if (data.kind === "no-commute-days") return <NeedsSetup reason="days" />;
  return <DashboardView view={data.view} locale={locale} now={now} />;
}
