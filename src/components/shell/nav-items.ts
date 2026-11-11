import type { IconName } from "@/components/icon";

export type NavItem = {
  href: "/" | "/weather" | "/history" | "/settings";
  key: "home" | "weather" | "history" | "settings";
  icon: IconName;
  iconActive: IconName;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", key: "home", icon: "home", iconActive: "homeFill" },
  { href: "/weather", key: "weather", icon: "rainy", iconActive: "rainyFill" },
  { href: "/history", key: "history", icon: "history", iconActive: "history" },
  {
    href: "/settings",
    key: "settings",
    icon: "settings",
    iconActive: "settingsFill",
  },
];

export function isActive(pathname: string, href: NavItem["href"]): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}
