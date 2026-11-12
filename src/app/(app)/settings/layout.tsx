export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  // Settings is a page to read and fill in, so its cards use the denser "reading" glass.
  return <div data-glass="reading">{children}</div>;
}
