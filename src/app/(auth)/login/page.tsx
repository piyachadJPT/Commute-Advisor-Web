import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AppMark } from "@/components/shell/app-mark";
import { LoginForm } from "@/features/auth/login-form";
import { safeNext } from "@/lib/auth/safe-next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("title") };
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="w-full max-w-md rounded-card p-6 glass sm:p-8">
      <Suspense fallback={<LoginSkeleton />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginContent({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const t = await getTranslations("auth");
  const { next } = await searchParams;

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <AppMark className="size-10 shrink-0" />
        <p className="text-label font-semibold text-ink-2">{t("app")}</p>
      </div>
      <h1 className="text-headline font-bold tracking-[-0.01em]">
        {t("title")}
      </h1>
      <p className="mt-1.5 mb-6 text-label text-ink-2">{t("intro")}</p>
      <LoginForm next={safeNext(typeof next === "string" ? next : null)} />
      <p className="mt-6 text-caption text-ink-3">{t("closed")}</p>
    </>
  );
}

function LoginSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="h-10 w-40 animate-pulse rounded-control bg-fill-soft" />
      <div className="h-8 w-48 animate-pulse rounded-control bg-fill-soft" />
      <div className="h-12 animate-pulse rounded-control bg-fill-soft" />
      <div className="h-12 animate-pulse rounded-control bg-fill-soft" />
    </div>
  );
}
