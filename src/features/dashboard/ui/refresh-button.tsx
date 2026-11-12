"use client";

import { useFormStatus } from "react-dom";
import { Icon } from "@/components/icon";

/** Submit button for the refresh form; spins while the Server Action runs. */
export function RefreshButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      aria-busy={pending}
      disabled={pending}
      className="grid size-11 shrink-0 place-items-center rounded-tile bg-(--hero-chip-bg) glass-chip transition-colors duration-(--duration-fast) hover:bg-glass disabled:cursor-wait"
    >
      <Icon
        name="refresh"
        className={`size-[1.375rem] ${pending ? "animate-spin motion-reduce:animate-none" : ""}`}
      />
    </button>
  );
}
