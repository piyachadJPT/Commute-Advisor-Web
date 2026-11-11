"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { AppMark } from "./app-mark";
import { isActive, NAV_ITEMS } from "./nav-items";

/** Floating glass tab bar below 1024px, floating glass rail from 1024px (plan §10.2). */
export function AppNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-3 bottom-[calc(0.625rem+env(safe-area-inset-bottom))] z-20 rounded-[20px] p-1.5 glass lg:inset-x-auto lg:top-4 lg:bottom-4 lg:left-4 lg:flex lg:w-(--rail-width) lg:flex-col lg:items-center lg:rounded-card lg:px-2 lg:py-4"
    >
      <div className="mb-5 hidden lg:block">
        <AppMark />
      </div>
      <ul className="mx-auto grid max-w-lg grid-cols-4 lg:flex lg:w-full lg:flex-col lg:gap-1.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-tile py-2 text-micro font-medium transition-colors duration-(--duration-fast)",
                  active
                    ? "bg-glass-strong text-ink"
                    : "text-ink-3 hover:text-ink",
                ].join(" ")}
              >
                <Icon
                  name={active ? item.iconActive : item.icon}
                  className="size-6"
                />
                <span>{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
