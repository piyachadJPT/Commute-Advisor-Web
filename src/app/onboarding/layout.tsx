export default function OnboardingLayout({
  children,
}: LayoutProps<"/onboarding">) {
  return (
    <div className="min-h-dvh">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-20 bg-(image:--sky-moto)"
      />
      <main data-sky="moto">{children}</main>
    </div>
  );
}
