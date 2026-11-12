import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AppNav } from "@/components/shell/app-nav";
import { DashboardSkeleton } from "@/components/shell/shell-skeleton";
import { getUserSettings } from "@/features/settings/data/settingsRepo";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      {/* Default sky for every screen; the Dashboard paints its verdict sky over it. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-20 bg-(image:--sky-moto)"
      />
      <AppNav />
      {/* The default sky is a bright one, so the cards use the bright-sky glass (tokens.css).
          The Dashboard sets its own data-sky inside; the nav stays outside and keeps the default. */}
      <main
        data-sky="moto"
        className="w-full px-4 pb-[calc(var(--tabbar-space)+env(safe-area-inset-bottom))] sm:px-6 lg:pr-8 lg:pb-10 lg:pl-[calc(var(--rail-width)+3rem)]"
      >
        <Suspense fallback={<DashboardSkeleton />}>
          <OnboardingGate>{children}</OnboardingGate>
        </Suspense>
      </main>
    </div>
  );
}

/**
 * Sends a new user to /onboarding before any app screen renders (plan §10.2). Someone who has
 * already set both locations counts as set up even if the flag is false: that is the owner
 * who configured the app before onboarding existed, and there is nothing left to ask them.
 */
async function OnboardingGate({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const s = await getUserSettings(await createClient(), user.id);
  if (s && !s.onboardingCompleted && !(s.home.isSet && s.work.isSet)) {
    redirect("/onboarding");
  }
  return children;
}
