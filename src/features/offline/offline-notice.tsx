"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icon";

const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

/**
 * The offline banner for a live Dashboard whose connection drops while it is open (plan §11.4:
 * "the same banner with Offline, cached data stays visible"). Renders nothing while online.
 * `text` is built on the server and always names when the data is from.
 */
export function OfflineNotice({ text }: { text: string }) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <p
      role="status"
      className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-tile bg-warn-surface px-4 py-2 text-label font-medium text-warn-ink shadow-glass"
    >
      <Icon name="wifiOff" className="size-5 shrink-0" />
      <span className="tabular">{text}</span>
    </p>
  );
}
