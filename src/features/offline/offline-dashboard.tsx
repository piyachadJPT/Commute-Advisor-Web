"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { DashboardView } from "@/features/dashboard/ui/dashboard-view";
import { primaryButton, quietButton } from "@/features/settings/ui/styles";
import { loadSnapshot, type Snapshot } from "./snapshot";

const STALE_AFTER_MS = 6 * 3_600_000; // plan §5.5

type State =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ready"; snapshot: Snapshot; now: Date };

/**
 * What the service worker shows when the network is down (plan §9, §11.4): the last Dashboard
 * this device saved, with the offline banner and the time its data is from. Other pages say they
 * need a connection. When the connection returns the page reloads itself.
 */
export function OfflineDashboard() {
  const t = useTranslations("offline");
  const [state, setState] = useState<State>({ status: "loading" });
  // The service worker answers every failed page load with this page, so the real URL tells
  // which page was asked for.
  const [path, setPath] = useState("/");

  useEffect(() => {
    let cancelled = false;
    loadSnapshot().then((snapshot) => {
      if (cancelled) return;
      setPath(window.location.pathname);
      setState(
        snapshot
          ? { status: "ready", snapshot, now: new Date() }
          : { status: "none" },
      );
    });
    const back = () => window.location.reload();
    window.addEventListener("online", back);
    return () => {
      cancelled = true;
      window.removeEventListener("online", back);
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div
        aria-busy="true"
        className="mt-6 h-64 animate-pulse rounded-card glass"
      />
    );
  }

  if (state.status === "none" || path !== "/") {
    const none = state.status === "none";
    return (
      <section className="mx-auto mt-8 max-w-xl rounded-card p-[1.125rem] glass">
        <p className="flex items-center gap-2 text-title font-semibold">
          <Icon name="wifiOff" className="size-5 shrink-0" />
          {none ? t("noData.title") : t("needsConnection.title")}
        </p>
        <p className="mt-1 text-body text-ink-2">
          {none ? t("noData.body") : t("needsConnection.body")}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={primaryButton}
          >
            {t("retry")}
          </button>
          {!none ? (
            <Link href="/" className={quietButton}>
              {t("openSaved")}
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  const { snapshot, now } = state;
  const fetchedAt = snapshot.view.fetchedAt;
  // The data got older while the app was closed: stale is judged now, not when it was saved.
  const stale =
    fetchedAt === null || now.getTime() - fetchedAt.getTime() > STALE_AFTER_MS;
  return (
    <DashboardView
      view={{ ...snapshot.view, stale }}
      locale={snapshot.locale}
      now={now}
      offline
    />
  );
}
