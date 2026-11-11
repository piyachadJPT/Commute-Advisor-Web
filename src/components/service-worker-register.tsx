"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js once the page is loaded, so a push can arrive and the click handler is
 * ready before anyone turns notifications on. Silent where service workers are unsupported
 * (and on insecure origins other than localhost).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => undefined);
  }, []);
  return null;
}
