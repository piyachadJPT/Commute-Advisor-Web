import { OfflineDashboard } from "@/features/offline/offline-dashboard";

/**
 * The offline fallback. It is public and carries no user data: everything it shows is read from
 * this device's IndexedDB in the browser, so the service worker can cache it for everyone.
 */
export default function OfflinePage() {
  return <OfflineDashboard />;
}
