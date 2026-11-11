/** Static shell shown while the localized UI streams in. Mirrors the Dashboard layout (§11.4). */
export function ShellSkeleton() {
  return (
    <div aria-busy="true" className="min-h-dvh">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-20 bg-(image:--sky-moto)"
      />
      <div className="fixed inset-x-3 bottom-[calc(0.625rem+env(safe-area-inset-bottom))] h-16 rounded-[20px] glass lg:inset-x-auto lg:top-4 lg:bottom-4 lg:left-4 lg:h-auto lg:w-(--rail-width) lg:rounded-card" />
      <div className="mx-auto w-full max-w-(--content-max) px-4 sm:px-6 lg:pr-8 lg:pl-[calc(var(--rail-width)+3rem)]">
        <DashboardSkeleton />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  const block = "glass animate-pulse rounded-card";
  return (
    <div aria-busy="true">
      <div className="flex h-[4.5rem] items-center">
        <div className="h-5 w-44 animate-pulse rounded-chip bg-(--hero-chip-light)" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:gap-[1.125rem]">
        <div className="h-48 lg:col-span-7">
          <div className="mt-6 h-7 w-24 animate-pulse rounded-chip bg-(--hero-chip-light)" />
          <div className="mt-4 h-14 w-3/4 animate-pulse rounded-tile bg-(--hero-chip-light)" />
        </div>
        <div className={`${block} h-64 lg:col-span-5`} />
        <div className={`${block} h-72 lg:col-span-8`} />
        <div className={`${block} h-72 lg:col-span-4`} />
      </div>
    </div>
  );
}
