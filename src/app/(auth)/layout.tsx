import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-sky="moto"
      className="relative flex min-h-dvh items-center justify-center px-4 py-10"
    >
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-(image:--sky-moto)"
      />
      {children}
    </div>
  );
}
