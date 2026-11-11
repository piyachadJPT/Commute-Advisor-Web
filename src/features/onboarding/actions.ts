"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markOnboardingCompleted } from "@/features/settings/data/settingsRepo";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Finishes onboarding (plan §11.7). Used by the last step and by "Skip setup" on every step:
 * every step is skippable, and skipping step 1 leaves the Dashboard on its set-up card.
 */
export async function completeOnboarding(): Promise<void> {
  const user = await requireUser();
  await markOnboardingCompleted(await createClient(), user.id);
  revalidatePath("/", "layout");
  redirect("/");
}
