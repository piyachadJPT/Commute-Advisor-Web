"use client";

import { clearSnapshot } from "@/features/offline/snapshot";
import { quietButton } from "@/features/settings/ui/styles";
import { signOut } from "./actions";

/**
 * Signing out also deletes the Dashboard saved on this device: it holds place names and rain
 * risks, so it must not outlive the session (plan §9).
 */
export function SignOutForm({ label }: { label: string }) {
  return (
    <form
      action={async () => {
        await clearSnapshot();
        await signOut();
      }}
      className="mt-3"
    >
      <button type="submit" className={quietButton}>
        {label}
      </button>
    </form>
  );
}
