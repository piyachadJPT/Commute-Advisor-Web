import { getLocale } from "next-intl/server";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/shell/shell-skeleton";
import { getMockDashboard, type MockState } from "@/features/dashboard/mock";
import { DashboardView } from "@/features/dashboard/ui/dashboard-view";
import { defaultLocale, isLocale } from "@/i18n/config";

const STATES: readonly MockState[] = ["car", "motorcycle", "unknown"];

// Phase 1 static mockup. Preview other states with ?state=motorcycle|unknown&stale=1.
export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  const requested = typeof params.state === "string" ? params.state : "car";
  const state = STATES.find((s) => s === requested) ?? "car";
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : defaultLocale;
  const view = getMockDashboard(state, params.stale === "1", locale);
  return <DashboardView view={view} locale={locale} />;
}
