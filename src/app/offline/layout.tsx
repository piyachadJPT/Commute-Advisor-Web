export default function OfflineLayout({ children }: LayoutProps<"/offline">) {
  return (
    <div className="min-h-dvh">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-20 bg-(image:--sky-moto)"
      />
      <main className="w-full px-4 pb-10 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
