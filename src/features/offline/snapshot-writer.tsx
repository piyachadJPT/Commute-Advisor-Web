"use client";

import { useEffect } from "react";
import type { DashboardView } from "@/features/dashboard/view";
import type { Locale } from "@/i18n/config";
import { saveSnapshot } from "./snapshot";

/**
 * Keeps the Dashboard the server just rendered, so it can be shown offline later (plan §9).
 * Renders nothing. It runs after every successful render of the Dashboard.
 */
export function SnapshotWriter({
  view,
  locale,
}: {
  view: DashboardView;
  locale: Locale;
}) {
  useEffect(() => {
    void saveSnapshot({ view, savedAt: new Date(), locale });
  }, [view, locale]);
  return null;
}
