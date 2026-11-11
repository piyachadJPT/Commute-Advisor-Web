import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { Suspense } from "react";
import { LocaleRoot } from "@/components/shell/locale-root";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import "@/styles/globals.css";

const plex = IBM_Plex_Sans_Thai({
  weight: ["400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Commute Advisor", template: "%s · Commute Advisor" },
  description:
    "Car or motorcycle today, from the chance of rain on your commute",
  // iPhone: lets the installed Home Screen app run standalone with a short label.
  appleWebApp: { capable: true, title: "Commute", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef4fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1520" },
  ],
};

// The locale comes from a cookie / Accept-Language (no URL prefix, plan §10.1),
// which is request data. With cacheComponents it must sit behind <Suspense>, so the
// static shell is the layout-matching skeleton and the localized UI streams in.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={plex.variable}>
      <body className="min-h-dvh">
        <ServiceWorkerRegister />
        <Suspense fallback={<ShellSkeleton />}>
          <LocaleRoot>{children}</LocaleRoot>
        </Suspense>
      </body>
    </html>
  );
}
