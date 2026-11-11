import { AppNav } from "@/components/shell/app-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      {/* Default sky for every screen; the Dashboard paints its verdict sky over it. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-20 bg-(image:--sky-moto)"
      />
      <AppNav />
      <main className="mx-auto w-full max-w-(--content-max) px-4 pb-[calc(var(--tabbar-space)+env(safe-area-inset-bottom))] sm:px-6 lg:pr-8 lg:pb-10 lg:pl-[calc(var(--rail-width)+3rem)]">
        {children}
      </main>
    </div>
  );
}
