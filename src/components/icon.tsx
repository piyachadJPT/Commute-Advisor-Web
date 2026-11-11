import { iconPaths, type IconName } from "./icon-paths";

type IconProps = {
  name: IconName;
  className?: string;
  /** Accessible label. Omit for decorative icons that sit next to text. */
  label?: string;
};

export function Icon({ name, className = "size-6", label }: IconProps) {
  return (
    <svg
      viewBox="0 -960 960 960"
      className={className}
      fill="currentColor"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

export type { IconName };
